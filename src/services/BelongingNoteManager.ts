import { App, Notice, TFile } from 'obsidian';
import moment from 'moment';
import { NoteStream } from '../types';
import { ensureFolderExists } from '../utils/fileUtils';
import { 
    formatDateForFilename, 
    getBelongingDate, 
    getChildDateRange,
    parseDateFromFilename 
} from '../utils/dateUtils';
import { processTemplateVariables } from '../utils/templateUtils';

export class BelongingNoteManager {
    private app: App;
    
    constructor(app: App) {
        this.app = app;
    }
    
    /**
     * Helper function to retrieve or create a belonging note.
     */
    private async getOrCreateBelongingNote(
        belongingNoteName: string, 
        belongingFolder: string, 
        belongingDate: moment.Moment, 
        stream: NoteStream
    ): Promise<TFile> {
        // Compute the default note path.
        let belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;
        const allFiles = this.app.vault.getMarkdownFiles();
        
        // Check if a file with the same basename already exists in the folder.
        for (const file of allFiles) {
            if (file.basename === belongingNoteName && file.path.startsWith(`${belongingFolder}/`) && file.path !== belongingNotePath) {
                belongingNotePath = file.path;
                break;
            }
        }
        
        let belongingFile = this.app.vault.getAbstractFileByPath(belongingNotePath);
        
        // If the file doesn't exist, create it.
        if (!(belongingFile instanceof TFile)) {
            await ensureFolderExists(this.app, belongingFolder);
            let initialContent = '';
            
            // Use a template if one is provided.
            if (stream.templatePath) {
                const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
                if (templateFile instanceof TFile) {
                    initialContent = await this.app.vault.read(templateFile);
                    initialContent = processTemplateVariables(initialContent, belongingDate, stream);
                }
            }
            
            belongingFile = await this.app.vault.create(belongingNotePath, initialContent);
        }
        
        return belongingFile as TFile;
    }

    /**
     * Create or update a belonging (parent) note for a child note
     */
    async createOrUpdateBelongingNote(file: TFile, stream: NoteStream): Promise<void> {
        if (!stream.enableBelongingNotes) {
            new Notice('Belonging notes are not enabled for this stream');
            return;
        }

        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            new Notice('Could not parse date from filename');
            return;
        }

        // Determine the belonging note's date.
        const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
        const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
        const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
        
        // Use the helper function to get or create the belonging note.
        const belongingFile = await this.getOrCreateBelongingNote(belongingNoteName, belongingFolder, belongingDate, stream);
        
        // Update the belonging note's content to include child notes.
        await this.updateBelongingNoteContent(belongingFile, stream);
        
        // Open the belonging note.
        await this.app.workspace.openLinkText(belongingFile.path, '', false);
    }

    /**
     * Update the content of a belonging note to include its child notes
     */
    async updateBelongingNoteContent(belongingFile: TFile, stream: NoteStream): Promise<void> {
        const belongingDate = parseDateFromFilename(belongingFile.basename, stream.belongingNoteDateFormat);
        if (!belongingDate) {
            return;
        }
        
        const dateRange = getChildDateRange(belongingDate, stream.belongingNoteType, stream.noteType);
        if (!dateRange) {
            return;
        }
        
        const childNotes: TFile[] = [];
        const allFiles = this.app.vault.getMarkdownFiles();
        
        for (const file of allFiles) {
            if (file.path.startsWith(`${stream.folderPath}/`)) {
                const date = parseDateFromFilename(file.basename, stream.dateFormat);
                if (date && date.isSameOrAfter(dateRange.start) && date.isSameOrBefore(dateRange.end)) {
                    childNotes.push(file);
                }
            }
        }
        
        childNotes.sort((a, b) => {
            const dateA = parseDateFromFilename(a.basename, stream.dateFormat);
            const dateB = parseDateFromFilename(b.basename, stream.dateFormat);
            return dateA && dateB ? dateA.valueOf() - dateB.valueOf() : 0;
        });
        
        const startStr = formatDateForFilename(dateRange.start, stream.dateFormat);
        const endStr = formatDateForFilename(dateRange.end, stream.dateFormat);
        
        await this.app.fileManager.processFrontMatter(belongingFile, (frontmatter) => {
            frontmatter['date-range'] = { start: startStr, end: endStr };
            if (frontmatter['child-notes']) {
                delete frontmatter['child-notes'];
            }
            const childNotePaths = childNotes.map(f => {
                const linkPath = f.path.replace('.md', '');
                return `[[${linkPath}|${f.basename}]]`;
            });
            frontmatter['child-notes'] = childNotePaths;
        });
    }

    /**
     * Update all belonging notes for a specific stream
     */
    async updateAllBelongingNotesForStream(stream: NoteStream): Promise<void> {
        if (!stream.enableBelongingNotes) {
            new Notice('Belonging notes are not enabled for this stream');
            return;
        }

        // Get all markdown files in the stream folder
        const allFiles = this.app.vault.getMarkdownFiles().filter(file =>
            file.path.startsWith(`${stream.folderPath}/`) || file.path === stream.folderPath
        );

        // Use a map to track unique belonging notes by a composite key (folder + note name)
        const belongingNotesMap = new Map<string, {
            belongingNoteName: string,
            belongingFolder: string,
            belongingDate: moment.Moment
        }>();

        // First pass: Identify all child notes and their corresponding belonging note info
        for (const file of allFiles) {
            const date = parseDateFromFilename(file.basename, stream.dateFormat);
            if (!date) continue;

            const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
            const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
            const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
            const key = `${belongingFolder}|${belongingNoteName}`;
            if (!belongingNotesMap.has(key)) {
                belongingNotesMap.set(key, { belongingNoteName, belongingFolder, belongingDate });
            }
        }

        // Second pass: Update (or create) each unique belonging note and update its content
        let notesUpdated = 0;
        for (const { belongingNoteName, belongingFolder, belongingDate } of belongingNotesMap.values()) {
            const belongingFile = await this.getOrCreateBelongingNote(belongingNoteName, belongingFolder, belongingDate, stream);
            await this.updateBelongingNoteContent(belongingFile, stream);
            notesUpdated++;
        }

        new Notice(`Updated ${notesUpdated} belonging notes for stream: ${stream.name || stream.folderPath}`);
    }

    /**
     * Update all belonging notes for all streams
     */
    async updateAllBelongingNotes(streams: NoteStream[]): Promise<void> {
        const enabledStreams = streams.filter(stream => stream.enableBelongingNotes);
        
        if (enabledStreams.length === 0) {
            new Notice('No streams have belonging notes enabled');
            return;
        }
        
        let totalUpdated = 0;
        
        for (const stream of enabledStreams) {
            await this.updateAllBelongingNotesForStream(stream);
            totalUpdated += 1;
        }
        
        new Notice(`Updated ${totalUpdated} belonging notes across ${enabledStreams.length} streams`);
    }
}