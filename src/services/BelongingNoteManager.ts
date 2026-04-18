import { App, Notice, TFile } from 'obsidian';
import moment from 'moment';
import { NoteStream, NoteType } from '../types';
import { ensureFolderExists, getChronologySourceForFolderPath, isChronologyNoteFile } from '../utils/fileUtils';
import {
    formatDateForFilename,
    getBelongingDate,
    getChildDateRange,
    parseDateFromFilename
} from '../utils/dateUtils';
import { processTemplateVariables } from '../utils/templateUtils';

interface ReconcileBelongingOptions {
    notifyOnConflict?: boolean;
    openAfterUpdate?: boolean;
}

interface BelongingResolution {
    status: 'resolved' | 'missing' | 'conflict';
    file?: TFile;
    candidates?: TFile[];
}

export class BelongingNoteManager {
    private app: App;
    
    constructor(app: App) {
        this.app = app;
    }

    async reconcileForChild(
        file: TFile,
        stream: NoteStream,
        options: ReconcileBelongingOptions = {}
    ): Promise<TFile | null> {
        if (!stream.enableBelongingNotes) {
            return null;
        }

        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            return null;
        }

        const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
        const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
        const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
        const resolution = this.resolveBelongingNote(belongingFolder, belongingNoteName, stream.belongingNoteType);

        if (resolution.status === 'conflict') {
            console.warn(
                `Chronolinker belonging conflict for ${belongingNoteName} in ${belongingFolder}`,
                resolution.candidates?.map(candidate => candidate.path)
            );

            if (options.notifyOnConflict) {
                new Notice(`Multiple belonging notes found for ${belongingNoteName}. Resolve duplicates before continuing.`);
            }

            return null;
        }

        const belongingFile = resolution.status === 'resolved' && resolution.file
            ? resolution.file
            : await this.createBelongingNote(belongingNoteName, belongingFolder, belongingDate, stream);

        await this.updateBelongingNoteContent(belongingFile, stream);

        if (options.openAfterUpdate) {
            await this.app.workspace.openLinkText(belongingFile.path, '', false);
        }

        return belongingFile;
    }

    async createOrUpdateBelongingNote(file: TFile, stream: NoteStream): Promise<void> {
        if (!stream.enableBelongingNotes) {
            new Notice('Belonging notes are not enabled for this stream');
            return;
        }

        await this.reconcileForChild(file, stream, {
            notifyOnConflict: true,
            openAfterUpdate: true
        });
    }

    async updateBelongingNoteContent(belongingFile: TFile, stream: NoteStream): Promise<void> {
        const belongingDate = parseDateFromFilename(belongingFile.basename, stream.belongingNoteDateFormat);
        if (!belongingDate) {
            return;
        }
        
        const dateRange = getChildDateRange(belongingDate, stream.belongingNoteType, stream.noteType);
        if (!dateRange) {
            return;
        }
        
        const childNotes = this.getResolvedChildNotesInRange(stream, dateRange.start, dateRange.end);
        
        const startStr = formatDateForFilename(dateRange.start, stream.dateFormat);
        const endStr = formatDateForFilename(dateRange.end, stream.dateFormat);
        const childNotePaths = childNotes.map(file => `[[${file.path.replace(/\.md$/u, '')}|${file.basename}]]`);
        const cachedFrontmatter = this.app.metadataCache.getFileCache(belongingFile)?.frontmatter ?? {};

        const currentRange = cachedFrontmatter['date-range'] as { start?: string; end?: string } | undefined;
        const currentChildren = Array.isArray(cachedFrontmatter['child-notes']) ? cachedFrontmatter['child-notes'] : [];
        const childrenChanged = JSON.stringify(currentChildren) !== JSON.stringify(childNotePaths);
        const rangeChanged = currentRange?.start !== startStr || currentRange?.end !== endStr;

        if (!childrenChanged && !rangeChanged) {
            return;
        }
        
        await this.app.fileManager.processFrontMatter(belongingFile, frontmatter => {
            frontmatter['date-range'] = { start: startStr, end: endStr };
            frontmatter['child-notes'] = childNotePaths;
        });
    }

    async updateAllBelongingNotesForStream(stream: NoteStream): Promise<void> {
        if (!stream.enableBelongingNotes) {
            new Notice('Belonging notes are not enabled for this stream');
            return;
        }

        const childNotes = this.app.vault.getMarkdownFiles().filter(file => isChronologyNoteFile(file, stream));
        const belongingTargets = new Map<string, moment.Moment>();

        for (const file of childNotes) {
            const date = parseDateFromFilename(file.basename, stream.dateFormat);
            if (!date) {
                continue;
            }

            const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
            const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
            belongingTargets.set(belongingNoteName, belongingDate);
        }

        let updatedCount = 0;
        for (const [belongingNoteName, belongingDate] of belongingTargets.entries()) {
            const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
            const resolution = this.resolveBelongingNote(belongingFolder, belongingNoteName, stream.belongingNoteType);

            if (resolution.status === 'conflict') {
                console.warn(
                    `Chronolinker skipped conflicting belonging note ${belongingNoteName}`,
                    resolution.candidates?.map(candidate => candidate.path)
                );
                continue;
            }

            const belongingFile = resolution.status === 'resolved' && resolution.file
                ? resolution.file
                : await this.createBelongingNote(belongingNoteName, belongingFolder, belongingDate, stream);

            await this.updateBelongingNoteContent(belongingFile, stream);
            updatedCount += 1;
        }

        new Notice(`Updated ${updatedCount} belonging notes for stream: ${stream.name || stream.folderPath}`);
    }

    async updateAllBelongingNotes(streams: NoteStream[]): Promise<void> {
        const enabledStreams = streams.filter(stream => stream.enableBelongingNotes);
        
        if (enabledStreams.length === 0) {
            new Notice('No streams have belonging notes enabled');
            return;
        }
        
        for (const stream of enabledStreams) {
            await this.updateAllBelongingNotesForStream(stream);
        }
        
        new Notice(`Updated belonging notes across ${enabledStreams.length} streams`);
    }

    private getResolvedChildNotesInRange(
        stream: NoteStream,
        startDate: moment.Moment,
        endDate: moment.Moment
    ): TFile[] {
        const candidateGroups = new Map<string, { date: moment.Moment; files: TFile[] }>();

        for (const file of this.app.vault.getMarkdownFiles()) {
            if (!isChronologyNoteFile(file, stream)) {
                continue;
            }

            const date = parseDateFromFilename(file.basename, stream.dateFormat);
            if (!date || date.isBefore(startDate) || date.isAfter(endDate)) {
                continue;
            }

            const existing = candidateGroups.get(file.basename);
            if (existing) {
                existing.files.push(file);
            } else {
                candidateGroups.set(file.basename, { date, files: [file] });
            }
        }

        return Array.from(candidateGroups.values())
            .sort((left, right) => {
                const byDate = left.date.valueOf() - right.date.valueOf();
                if (byDate !== 0) {
                    return byDate;
                }

                return left.files[0].path.localeCompare(right.files[0].path);
            })
            .flatMap(group => {
                if (group.files.length > 1) {
                    console.warn(
                        `Chronolinker skipped conflicting child notes for ${group.files[0].basename}`,
                        group.files.map(file => file.path)
                    );
                    return [];
                }

                return group.files;
            });
    }

    private resolveBelongingNote(
        belongingFolder: string,
        belongingNoteName: string,
        belongingNoteType: NoteType
    ): BelongingResolution {
        const candidates = this.app.vault
            .getMarkdownFiles()
            .filter(file =>
                file.basename === belongingNoteName &&
                getChronologySourceForFolderPath(file.path, belongingFolder, belongingNoteType) !== null
            )
            .sort((left, right) => {
                const leftSource = getChronologySourceForFolderPath(left.path, belongingFolder, belongingNoteType);
                const rightSource = getChronologySourceForFolderPath(right.path, belongingFolder, belongingNoteType);

                if (leftSource !== rightSource) {
                    return leftSource === 'root' ? -1 : 1;
                }

                return left.path.localeCompare(right.path);
            });

        if (candidates.length === 0) {
            return { status: 'missing' };
        }

        if (candidates.length > 1) {
            return { status: 'conflict', candidates };
        }

        return { status: 'resolved', file: candidates[0] };
    }
    
    private async createBelongingNote(
        belongingNoteName: string,
        belongingFolder: string,
        belongingDate: moment.Moment,
        stream: NoteStream
    ): Promise<TFile> {
        const belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;

        await ensureFolderExists(this.app, belongingFolder);

        let initialContent = '';
        if (stream.belongingTemplatePath) {
            const templateFile = this.app.vault.getAbstractFileByPath(stream.belongingTemplatePath);
            if (templateFile instanceof TFile) {
                const templateStream: NoteStream = {
                    ...stream,
                    noteType: stream.belongingNoteType,
                    dateFormat: stream.belongingNoteDateFormat
                };
                initialContent = await this.app.vault.read(templateFile);
                initialContent = processTemplateVariables(initialContent, belongingDate, templateStream);
            }
        }

        return this.app.vault.create(belongingNotePath, initialContent);
    }
}
