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

        // Determine the belonging note's date
        const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
        
        // Create or get the belonging note
        const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
        const belongingFolder = stream.belongingNoteFolder || stream.folderPath;

        let belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;
        const allFiles = this.app.vault.getMarkdownFiles();
        for (const file of allFiles) {
            if (file.basename === belongingNoteName && file.path.startsWith(belongingFolder) && file.path !== belongingNotePath) {
                belongingNotePath = file.path;
                new Notice(`Found existing belonging note: ${belongingNotePath}`);
                break;
            }
        }
        
        let belongingFile = this.app.vault.getAbstractFileByPath(belongingNotePath);
        
        // Create the belonging note if it doesn't exist
        if (!(belongingFile instanceof TFile)) {
            // Ensure the folder exists
            await ensureFolderExists(this.app, belongingFolder);
            
            // Create initial content for the belonging note
            let initialContent = '';
            
            // Try to use a template if specified
            if (stream.templatePath) {
                const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
                if (templateFile instanceof TFile) {
                    initialContent = await this.app.vault.read(templateFile);
                    
                    // Process template variables
                    initialContent = processTemplateVariables(initialContent, belongingDate, stream);
                }
            }
            
            // Create the file
            belongingFile = await this.app.vault.create(belongingNotePath, initialContent);
        }
        
        // Update the belonging note's content to include child notes
        await this.updateBelongingNoteContent(belongingFile as TFile, stream);
        
        // Open the belonging note
        await this.app.workspace.openLinkText(belongingFile.path, '', false);
        
        // new Notice(`Created/updated belonging note: ${belongingNoteName}`);
    }

    /**
     * Update the content of a belonging note to include its child notes
     */
    async updateBelongingNoteContent(belongingFile: TFile, stream: NoteStream): Promise<void> {
        // Get the belonging note date
        const belongingDate = parseDateFromFilename(belongingFile.basename, stream.belongingNoteDateFormat);
        if (!belongingDate) {
            return;
        }
        
        // Get the date range for child notes
        const dateRange = getChildDateRange(belongingDate, stream.belongingNoteType, stream.noteType);
        if (!dateRange) {
            return;
        }
        
        // Find all child notes within the date range
        const childNotes: TFile[] = [];
        
        // Get all markdown files in the vault
        const allFiles = this.app.vault.getMarkdownFiles();
        
        // Filter files that are directly in the stream folder (not in subfolders)
        // and fall within the date range
        for (const file of allFiles) {
            if (file.path === stream.folderPath || file.path.startsWith(`${stream.folderPath}/`)) {
                const date = parseDateFromFilename(file.basename, stream.dateFormat);
                if (date && date.isSameOrAfter(dateRange.start) && date.isSameOrBefore(dateRange.end)) {
                    childNotes.push(file);
                }
            }
        }
        
        // Sort child notes by date
        childNotes.sort((a, b) => {
            const dateA = parseDateFromFilename(a.basename, stream.dateFormat);
            const dateB = parseDateFromFilename(b.basename, stream.dateFormat);
            
            if (dateA && dateB) {
                return dateA.valueOf() - dateB.valueOf();
            }
            
            return 0;
        });
        
        const startStr = formatDateForFilename(dateRange.start, stream.dateFormat);
        const endStr = formatDateForFilename(dateRange.end, stream.dateFormat);
        // Update the belonging note frontmatter
        await this.app.fileManager.processFrontMatter(belongingFile, (frontmatter) => {
            // Only store the date range in frontmatter, not the child notes
            frontmatter['date-range'] = {
                start: startStr,
                end: endStr
            };
            
            // Remove the child-notes from frontmatter if it exists to avoid duplication
            if (frontmatter['child-notes']) {
                delete frontmatter['child-notes'];
            };

            // Add child notes to frontmatter as a properly formatted list
            const childNotePaths = childNotes.map(f => {
                const linkPath = f.path.replace('.md', '');
                return `[[${linkPath}|${f.basename}]]`;
            });
                        
            // Add to frontmatter as a YAML array
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

        // Track belonging notes to update and files that have been processed
        const belongingNotesToUpdate = new Set<string>();
        const processedFiles = new Set<string>();
        
        // First pass: identify all child notes and their belonging notes
        for (const file of allFiles) {
            // Skip files already processed
            if (processedFiles.has(file.path)) continue;
            
            const date = parseDateFromFilename(file.basename, stream.dateFormat);
            if (!date) continue;

            // Determine the belonging note's date
            const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
            
            // Create the belonging note name
            const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
            const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
            let belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;
            const allFiles = this.app.vault.getMarkdownFiles();
            for (const file of allFiles) {
                if (file.basename === belongingNoteName && file.path.startsWith(belongingFolder) && file.path !== belongingNotePath) {
                    belongingNotePath = file.path;
                    new Notice(`Found existing belonging note: ${belongingNotePath}`);
                    break;
                }
            }
                
            // Add to the set of belonging notes to update
            belongingNotesToUpdate.add(belongingNotePath);
            processedFiles.add(file.path);
        }

        // Second pass: Update or create each belonging note
        let notesUpdated = 0;
        for (const belongingNotePath of belongingNotesToUpdate) {
            let belongingFile = this.app.vault.getAbstractFileByPath(belongingNotePath);
            
            // Create the belonging note if it doesn't exist
            if (!(belongingFile instanceof TFile)) {
                const belongingFolder = belongingNotePath.substring(0, belongingNotePath.lastIndexOf('/'));
                const belongingNoteName = belongingNotePath.substring(belongingNotePath.lastIndexOf('/') + 1, belongingNotePath.lastIndexOf('.'));
                
                // Ensure the folder exists
                await ensureFolderExists(this.app, belongingFolder);
                
                // Calculate belonging date from the filename
                const belongingDate = parseDateFromFilename(belongingNoteName, stream.belongingNoteDateFormat);
                if (!belongingDate) continue;
                
                // Create initial content
                let initialContent = '';
                
                // Try to use a template if specified
                if (stream.templatePath) {
                    const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
                    if (templateFile instanceof TFile) {
                        initialContent = await this.app.vault.read(templateFile);
                        
                        // Process template variables
                        initialContent = processTemplateVariables(initialContent, belongingDate, stream);
                    }
                }
                
                // Create the file
                belongingFile = await this.app.vault.create(belongingNotePath, initialContent);
            }
            
            // Update the belonging note's content to include child notes
            await this.updateBelongingNoteContent(belongingFile as TFile, stream);
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
            // Get all markdown files in the stream folder
            const allFiles = this.app.vault.getMarkdownFiles().filter(file => 
                file.path.startsWith(`${stream.folderPath}/`) || file.path === stream.folderPath
            );

            // Track belonging notes to update
            const belongingNotesToUpdate = new Set<string>();
            
            // First pass: identify all child notes and their belonging notes
            for (const file of allFiles) {
                const date = parseDateFromFilename(file.basename, stream.dateFormat);
                if (!date) continue;

                // Determine the belonging note's date
                const belongingDate = getBelongingDate(date, stream.noteType, stream.belongingNoteType);
                
                // Create the belonging note name
                const belongingNoteName = formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
                const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
                let belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;
                const allFiles = this.app.vault.getMarkdownFiles();
                for (const file of allFiles) {
                    if (file.basename === belongingNoteName && file.path.startsWith(belongingFolder) && file.path !== belongingNotePath) {
                        belongingNotePath = file.path;
                        new Notice(`Found existing belonging note: ${belongingNotePath}`);
                        break;
                    }
                }
        

                
                // Add to the set of belonging notes to update
                belongingNotesToUpdate.add(belongingNotePath);
            }

            // Second pass: Update or create each belonging note
            for (const belongingNotePath of belongingNotesToUpdate) {
                let belongingFile = this.app.vault.getAbstractFileByPath(belongingNotePath);
                
                // Create the belonging note if it doesn't exist
                if (!(belongingFile instanceof TFile)) {
                    const belongingFolder = belongingNotePath.substring(0, belongingNotePath.lastIndexOf('/'));
                    const belongingNoteName = belongingNotePath.substring(belongingNotePath.lastIndexOf('/') + 1, belongingNotePath.lastIndexOf('.'));
                    
                    // Ensure the folder exists
                    await ensureFolderExists(this.app, belongingFolder);
                    
                    // Calculate belonging date from the filename
                    const belongingDate = parseDateFromFilename(belongingNoteName, stream.belongingNoteDateFormat);
                    if (!belongingDate) continue;
                    
                    // Create initial content
                    let initialContent = '';
                    
                    // Try to use a template if specified
                    if (stream.templatePath) {
                        const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
                        if (templateFile instanceof TFile) {
                            initialContent = await this.app.vault.read(templateFile);
                            
                            // Process template variables
                            initialContent = processTemplateVariables(initialContent, belongingDate, stream);
                        }
                    }
                    
                    // Create the file
                    belongingFile = await this.app.vault.create(belongingNotePath, initialContent);
                }
                
                // Update the belonging note's content to include child notes
                await this.updateBelongingNoteContent(belongingFile as TFile, stream);
                totalUpdated++;
            }
        }
        
        new Notice(`Updated ${totalUpdated} belonging notes across ${enabledStreams.length} streams`);
    }
}