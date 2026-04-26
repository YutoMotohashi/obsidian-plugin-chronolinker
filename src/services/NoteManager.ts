import { App, Notice, TFile, parseYaml } from 'obsidian';
import moment from 'moment';
import { NoteStream, NoteType } from '../types';
import {
    ensureFolderExists,
    getChronologySourceForFolderPath,
    isChronologyNoteFile
} from '../utils/fileUtils';
import { formatDateForFilename, getNextDate, getPreviousDate, parseDateFromFilename } from '../utils/dateUtils';
import { processTemplateVariables } from '../utils/templateUtils';
import { BelongingNoteManager } from './BelongingNoteManager';

type ResolutionStatus = 'resolved' | 'missing' | 'conflict';
type ResolutionSource = 'root' | 'archive';

interface ResolveExistingNoteResult {
    status: ResolutionStatus;
    noteName: string;
    file?: TFile;
    source?: ResolutionSource;
    candidates?: TFile[];
}

interface EnsureNoteOptions {
    createIfMissing?: boolean;
    promptBeforeCreate?: boolean;
    open?: boolean;
    openInNewLeaf?: boolean;
    reconcileIfResolved?: boolean;
    updateBelonging?: boolean;
    interactive?: boolean;
    managedFieldMode?: 'conservative' | 'authoritative';
}

interface ReconcileChronologyOptions {
    updateBelonging?: boolean;
    interactive?: boolean;
    reason?: string;
    managedFieldMode?: 'conservative' | 'authoritative';
}

export class NoteManager {
    private app: App;
    private belongingNoteManager: BelongingNoteManager | null = null;
    private streamQueues = new Map<string, Promise<void>>();
    private scheduledReconciles = new Map<string, ReturnType<typeof setTimeout>>();
    private ignoredCreatePaths = new Map<string, number>();
    private ignoredModifyPaths = new Map<string, number>();

    constructor(app: App) {
        this.app = app;
    }

    setBelongingNoteManager(manager: BelongingNoteManager): void {
        this.belongingNoteManager = manager;
    }

    shouldIgnoreCreateEvent(path: string): boolean {
        return this.shouldIgnoreEvent(this.ignoredCreatePaths, path);
    }

    shouldIgnoreModifyEvent(path: string): boolean {
        return this.shouldIgnoreEvent(this.ignoredModifyPaths, path);
    }

    async discardSafeDuplicatePlaceholder(file: TFile, stream: NoteStream): Promise<boolean> {
        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            return false;
        }

        const resolution = this.resolveExistingNote(stream, date);
        if (resolution.status !== 'conflict' || !resolution.candidates?.some(candidate => candidate.path === file.path)) {
            return false;
        }

        const currentSource = getChronologySourceForFolderPath(file.path, stream.folderPath, stream.noteType);
        if (currentSource !== 'root') {
            return false;
        }

        const remainingCandidates = resolution.candidates.filter(candidate => candidate.path !== file.path);
        if (remainingCandidates.length !== 1) {
            return false;
        }

        const canonicalCandidate = remainingCandidates[0];
        const canonicalSource = getChronologySourceForFolderPath(canonicalCandidate.path, stream.folderPath, stream.noteType);
        if (canonicalSource !== 'archive') {
            return false;
        }

        const content = await this.app.vault.read(file);
        if (!this.isSafeDuplicatePlaceholderContent(content, stream)) {
            return false;
        }

        const scheduledTimer = this.scheduledReconciles.get(file.path);
        if (scheduledTimer) {
            clearTimeout(scheduledTimer);
            this.scheduledReconciles.delete(file.path);
        }

        console.warn(
            `Chronolinker discarded placeholder duplicate ${file.path} in favor of archived note ${canonicalCandidate.path}`
        );
        await this.app.vault.delete(file);
        return true;
    }

    scheduleReconcile(
        file: TFile,
        stream: NoteStream,
        options: ReconcileChronologyOptions = {},
        delayMs = 750
    ): void {
        const existingTimer = this.scheduledReconciles.get(file.path);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            this.scheduledReconciles.delete(file.path);
            void this.enqueueReconcile(file, stream, options);
        }, delayMs);

        this.scheduledReconciles.set(file.path, timer);
    }

    listChronologyFiles(stream: NoteStream): TFile[] {
        return this.app.vault
            .getMarkdownFiles()
            .filter(file => isChronologyNoteFile(file, stream))
            .sort((left, right) => {
                const leftDate = parseDateFromFilename(left.basename, stream.dateFormat);
                const rightDate = parseDateFromFilename(right.basename, stream.dateFormat);

                if (leftDate && rightDate) {
                    const byDate = leftDate.valueOf() - rightDate.valueOf();
                    if (byDate !== 0) {
                        return byDate;
                    }
                }

                return left.path.localeCompare(right.path);
            });
    }

    resolveExistingNote(stream: NoteStream, date: moment.Moment): ResolveExistingNoteResult {
        const normalizedDate = this.normalizeDateForNoteType(date, stream.noteType);
        const noteName = formatDateForFilename(normalizedDate, stream.dateFormat);
        const candidates = this.getCandidatesForNoteName(stream, noteName);

        if (candidates.length === 0) {
            return { status: 'missing', noteName };
        }

        if (candidates.length > 1) {
            return { status: 'conflict', noteName, candidates };
        }

        const file = candidates[0];
        const source = getChronologySourceForFolderPath(file.path, stream.folderPath, stream.noteType);

        return {
            status: 'resolved',
            noteName,
            file,
            source: source === 'archive' ? 'archive' : 'root'
        };
    }

    async openCurrentNoteForStream(stream: NoteStream, options: Pick<EnsureNoteOptions, 'openInNewLeaf'> = {}): Promise<void> {
        const currentDate = this.getCurrentPeriodDate(stream.noteType);
        await this.openNoteForDate(stream, currentDate, {
            createIfMissing: true,
            open: true,
            openInNewLeaf: options.openInNewLeaf,
            reconcileIfResolved: true,
            updateBelonging: true,
            interactive: true,
            managedFieldMode: 'conservative'
        });
    }

    async openNoteForDate(stream: NoteStream, date: moment.Moment, options: EnsureNoteOptions = {}): Promise<TFile | null> {
        const file = await this.ensureNote(stream, date, {
            ...options,
            open: false
        });

        if (file && options.open !== false) {
            await this.app.workspace.openLinkText(file.path, '', options.openInNewLeaf === true);
        }

        return file;
    }

    async ensureNote(stream: NoteStream, date: moment.Moment, options: EnsureNoteOptions = {}): Promise<TFile | null> {
        const normalizedDate = this.normalizeDateForNoteType(date, stream.noteType);
        const resolution = this.resolveExistingNote(stream, normalizedDate);

        if (resolution.status === 'conflict') {
            this.reportConflict(stream, resolution, options.interactive === true);
            return null;
        }

        if (resolution.status === 'resolved' && resolution.file) {
            if (options.reconcileIfResolved) {
                await this.enqueueReconcile(resolution.file, stream, {
                    updateBelonging: options.updateBelonging,
                    interactive: options.interactive,
                    reason: 'ensure-existing',
                    managedFieldMode: options.managedFieldMode ?? 'conservative'
                });
            }
            return resolution.file;
        }

        if (options.createIfMissing === false) {
            return null;
        }

        const createNote = options.promptBeforeCreate === true
            ? confirm(`Note ${resolution.noteName}.md does not exist. Create it?`)
            : true;

        if (!createNote) {
            return null;
        }

        const file = await this.createNote(stream, normalizedDate, resolution.noteName);
        await this.enqueueReconcile(file, stream, {
            updateBelonging: options.updateBelonging,
            interactive: options.interactive,
            reason: 'ensure-created',
            managedFieldMode: options.managedFieldMode ?? 'conservative'
        });

        return file;
    }

    async ensureNoteRange(
        stream: NoteStream,
        startDate: moment.Moment,
        count: number,
        options: EnsureNoteOptions = {}
    ): Promise<TFile[]> {
        const total = Math.max(0, Math.floor(count));
        if (total === 0) {
            return [];
        }

        const files: TFile[] = [];
        let currentDate = this.normalizeDateForNoteType(startDate, stream.noteType);

        for (let index = 0; index < total; index += 1) {
            const file = await this.ensureNote(stream, currentDate, {
                ...options,
                open: false,
                promptBeforeCreate: false
            });

            if (file) {
                files.push(file);
            }

            currentDate = getNextDate(currentDate, stream.noteType);
        }

        return files;
    }

    async navigateToPreviousNote(file: TFile, stream: NoteStream): Promise<void> {
        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            new Notice('Could not parse date from filename');
            return;
        }

        const previousDate = getPreviousDate(date, stream.noteType);
        await this.openNoteForDate(stream, previousDate, {
            createIfMissing: true,
            promptBeforeCreate: true,
            open: true,
            reconcileIfResolved: true,
            updateBelonging: true,
            interactive: true,
            managedFieldMode: 'conservative'
        });
    }

    async navigateToNextNote(file: TFile, stream: NoteStream): Promise<void> {
        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            new Notice('Could not parse date from filename');
            return;
        }

        const nextDate = getNextDate(date, stream.noteType);
        await this.openNoteForDate(stream, nextDate, {
            createIfMissing: true,
            promptBeforeCreate: true,
            open: true,
            reconcileIfResolved: true,
            updateBelonging: true,
            interactive: true,
            managedFieldMode: 'conservative'
        });
    }

    async updateNoteLinks(file: TFile, stream: NoteStream): Promise<void> {
        await this.enqueueReconcile(file, stream, {
            updateBelonging: stream.enableBelongingNotes,
            interactive: false,
            reason: 'manual-update',
            managedFieldMode: 'authoritative'
        });
        new Notice(`Updated chronology for ${file.basename}`);
    }

    async handleNoteRename(file: TFile, oldPath: string, noteStreams: NoteStream[]): Promise<void> {
        const affectedStreams = noteStreams.filter(stream =>
            oldPath.startsWith(`${stream.folderPath}/`) || file.path.startsWith(`${stream.folderPath}/`)
        );

        for (const stream of affectedStreams) {
            await this.updateAllNoteLinks(stream);
        }
    }

    async updateAllNoteLinks(stream: NoteStream): Promise<void> {
        const files = this.listChronologyFiles(stream);

        if (files.length === 0) {
            new Notice(`No chronology notes found in ${stream.folderPath}`);
            return;
        }

        let updatedCount = 0;
        for (const file of files) {
            await this.enqueueReconcile(file, stream, {
                updateBelonging: false,
                interactive: false,
                reason: 'bulk-update',
                managedFieldMode: 'authoritative'
            });
            updatedCount += 1;
        }

        new Notice(`Updated ${updatedCount} notes in stream: ${stream.name || stream.folderPath}`);
    }

    async enqueueReconcile(file: TFile, stream: NoteStream, options: ReconcileChronologyOptions = {}): Promise<void> {
        const queueKey = stream.id || stream.folderPath;
        const previous = this.streamQueues.get(queueKey) ?? Promise.resolve();
        const next = previous
            .catch(error => {
                console.error(`Chronolinker queue recovered after error in ${stream.name || stream.folderPath}:`, error);
            })
            .then(async () => {
                await this.reconcileChronology(file, stream, options);
            });

        this.streamQueues.set(queueKey, next);

        try {
            await next;
        } finally {
            if (this.streamQueues.get(queueKey) === next) {
                this.streamQueues.delete(queueKey);
            }
        }
    }

    private async reconcileChronology(file: TFile, stream: NoteStream, options: ReconcileChronologyOptions): Promise<void> {
        if (!isChronologyNoteFile(file, stream)) {
            return;
        }

        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            return;
        }

        const selfResolution = this.resolveExistingNote(stream, date);
        if (selfResolution.status !== 'resolved' || !selfResolution.file || selfResolution.file.path !== file.path) {
            if (selfResolution.status === 'conflict') {
                console.warn(`Chronolinker skipped reconcile for conflicting note ${file.path}`, selfResolution.candidates);
            }
            return;
        }

        const managedFieldMode = options.managedFieldMode ?? 'authoritative';
        await this.updateManagedChronologyFields(file, stream, date, managedFieldMode);

        const adjacentDates = [getPreviousDate(date, stream.noteType), getNextDate(date, stream.noteType)];
        for (const adjacentDate of adjacentDates) {
            const adjacentResolution = this.resolveExistingNote(stream, adjacentDate);
            if (adjacentResolution.status === 'resolved' && adjacentResolution.file) {
                await this.updateManagedChronologyFields(adjacentResolution.file, stream, adjacentDate, managedFieldMode);
            }
        }

        if (options.updateBelonging !== false && stream.enableBelongingNotes && this.belongingNoteManager) {
            await this.belongingNoteManager.reconcileForChild(file, stream, {
                notifyOnConflict: options.interactive === true,
                openAfterUpdate: false,
                rebuildMode: 'conservative'
            });
        }
    }

    private async updateManagedChronologyFields(
        file: TFile,
        stream: NoteStream,
        date?: moment.Moment,
        managedFieldMode: 'conservative' | 'authoritative' = 'authoritative'
    ): Promise<void> {
        const fileDate = date ?? parseDateFromFilename(file.basename, stream.dateFormat);
        if (!fileDate) {
            return;
        }

        const previousResolution = this.resolveExistingNote(stream, getPreviousDate(fileDate, stream.noteType));
        const nextResolution = this.resolveExistingNote(stream, getNextDate(fileDate, stream.noteType));

        if (previousResolution.status === 'conflict') {
            console.warn(`Chronolinker found conflicting previous note candidates for ${file.path}`, previousResolution.candidates);
        }
        if (nextResolution.status === 'conflict') {
            console.warn(`Chronolinker found conflicting next note candidates for ${file.path}`, nextResolution.candidates);
        }

        const desiredPrevious = previousResolution.status === 'resolved' && previousResolution.file
            ? this.toWikilink(previousResolution.file)
            : undefined;
        const desiredNext = nextResolution.status === 'resolved' && nextResolution.file
            ? this.toWikilink(nextResolution.file)
            : undefined;

        const currentFrontmatter = await this.readFrontmatter(file);
        const currentPrevious = currentFrontmatter[stream.beforeFieldName];
        const currentNext = currentFrontmatter[stream.afterFieldName];
        const shouldChangePrevious = this.shouldUpdateManagedField(
            currentPrevious,
            desiredPrevious,
            stream.overwriteExisting,
            managedFieldMode
        );
        const shouldChangeNext = this.shouldUpdateManagedField(
            currentNext,
            desiredNext,
            stream.overwriteExisting,
            managedFieldMode
        );

        if (!shouldChangePrevious && !shouldChangeNext) {
            return;
        }

        await this.processManagedFrontmatter(file, frontmatter => {
            if (shouldChangePrevious) {
                this.applyManagedFieldValue(frontmatter, stream.beforeFieldName, desiredPrevious);
            }
            if (shouldChangeNext) {
                this.applyManagedFieldValue(frontmatter, stream.afterFieldName, desiredNext);
            }
        });
    }

    private shouldUpdateManagedField(
        existingValue: unknown,
        desiredValue: string | undefined,
        overwriteExisting: boolean,
        managedFieldMode: 'conservative' | 'authoritative'
    ): boolean {
        if (managedFieldMode === 'conservative' && desiredValue === undefined) {
            return false;
        }

        if (overwriteExisting) {
            return existingValue !== desiredValue;
        }

        if (existingValue === undefined) {
            return desiredValue !== undefined;
        }

        return false;
    }

    private applyManagedFieldValue(frontmatter: Record<string, unknown>, fieldName: string, value: string | undefined): void {
        if (value === undefined) {
            delete frontmatter[fieldName];
            return;
        }

        frontmatter[fieldName] = value;
    }

    private async processManagedFrontmatter(
        file: TFile,
        updater: (frontmatter: Record<string, unknown>) => void
    ): Promise<void> {
        this.markIgnored(this.ignoredModifyPaths, file.path);
        await this.app.fileManager.processFrontMatter(file, frontmatter => {
            updater(frontmatter as Record<string, unknown>);
        });
        this.markIgnored(this.ignoredModifyPaths, file.path);
    }

    private async readFrontmatter(file: TFile): Promise<Record<string, unknown>> {
        const content = await this.app.vault.read(file);
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*/u);
        if (!frontmatterMatch) {
            return {};
        }

        try {
            const parsed = parseYaml(frontmatterMatch[1]);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }

            return parsed as Record<string, unknown>;
        } catch (error) {
            console.warn(`Chronolinker failed to parse frontmatter for ${file.path}`, error);
            return {};
        }
    }

    private async createNote(stream: NoteStream, date: moment.Moment, noteName: string): Promise<TFile> {
        await ensureFolderExists(this.app, stream.folderPath);

        const filePath = `${stream.folderPath}/${noteName}.md`;
        let initialContent = '';

        if (stream.templatePath) {
            const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
            if (templateFile instanceof TFile) {
                initialContent = await this.app.vault.read(templateFile);
                initialContent = processTemplateVariables(initialContent, date, stream);
            }
        }

        this.markIgnored(this.ignoredCreatePaths, filePath);
        return this.app.vault.create(filePath, initialContent);
    }

    private getCandidatesForNoteName(stream: NoteStream, noteName: string): TFile[] {
        return this.app.vault
            .getMarkdownFiles()
            .filter(file => file.basename === noteName && isChronologyNoteFile(file, stream))
            .sort((left, right) => {
                const leftSource = getChronologySourceForFolderPath(left.path, stream.folderPath, stream.noteType);
                const rightSource = getChronologySourceForFolderPath(right.path, stream.folderPath, stream.noteType);

                if (leftSource !== rightSource) {
                    return leftSource === 'root' ? -1 : 1;
                }

                return left.path.localeCompare(right.path);
            });
    }

    private normalizeDateForNoteType(date: moment.Moment, noteType: NoteType): moment.Moment {
        const normalized = date.clone();

        switch (noteType) {
            case NoteType.DAY:
                return normalized.startOf('day');
            case NoteType.WEEK:
                return normalized.startOf('week');
            case NoteType.MONTH:
                return normalized.startOf('month');
            case NoteType.QUARTER:
                return normalized.startOf('quarter');
            case NoteType.HALF_YEAR:
                return normalized.month(normalized.month() < 6 ? 0 : 6).startOf('month');
            case NoteType.YEAR:
                return normalized.startOf('year');
            default:
                return normalized;
        }
    }

    private getCurrentPeriodDate(noteType: NoteType): moment.Moment {
        return this.normalizeDateForNoteType(moment(), noteType);
    }

    private toWikilink(file: TFile): string {
        const linkPath = file.path.replace(/\.md$/u, '');
        return `[[${linkPath}|${file.basename}]]`;
    }

    private reportConflict(stream: NoteStream, resolution: ResolveExistingNoteResult, notifyUser: boolean): void {
        console.warn(
            `Chronolinker conflict for ${resolution.noteName} in ${stream.name || stream.folderPath}`,
            resolution.candidates?.map(file => file.path)
        );

        if (notifyUser) {
            new Notice(`Multiple notes found for ${resolution.noteName}. Resolve duplicates before continuing.`);
        }
    }

    private shouldIgnoreEvent(map: Map<string, number>, path: string): boolean {
        this.pruneIgnoredPaths(map);
        return (map.get(path) ?? 0) > Date.now();
    }

    private isSafeDuplicatePlaceholderContent(content: string, stream: NoteStream): boolean {
        if (content.trim().length === 0) {
            return true;
        }

        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*/u);
        if (!frontmatterMatch) {
            return false;
        }

        const body = content.slice(frontmatterMatch[0].length).trim();
        if (body.length > 0) {
            return false;
        }

        try {
            const parsed = parseYaml(frontmatterMatch[1]);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return false;
            }

            const allowedFields = new Set([
                stream.beforeFieldName,
                stream.afterFieldName,
                'date-range',
                'child-notes',
                'updated'
            ]);

            return Object.keys(parsed as Record<string, unknown>).every(key => allowedFields.has(key));
        } catch (error) {
            console.warn('Chronolinker failed to parse duplicate placeholder frontmatter', error);
            return false;
        }
    }

    private markIgnored(map: Map<string, number>, path: string, durationMs = 1500): void {
        map.set(path, Date.now() + durationMs);
    }

    private pruneIgnoredPaths(map: Map<string, number>): void {
        const now = Date.now();
        for (const [path, expiresAt] of map.entries()) {
            if (expiresAt <= now) {
                map.delete(path);
            }
        }
    }
}
