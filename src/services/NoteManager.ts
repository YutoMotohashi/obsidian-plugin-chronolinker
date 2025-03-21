import { App, Notice, TFile } from 'obsidian';
import moment from 'moment';
import { NoteStream } from '../types';
import { ensureFolderExists } from '../utils/fileUtils';
import { formatDateForFilename, getNextDate, getPreviousDate, parseDateFromFilename } from '../utils/dateUtils';
import { processTemplateVariables } from '../utils/templateUtils';

export class NoteManager {
    private app: App;
    private isUpdating: boolean = false;
    
    constructor(app: App) {
        this.app = app;
    }
    
    /**
     * Navigate to the previous note in the chronological sequence
     */
    async navigateToPreviousNote(file: TFile, stream: NoteStream): Promise<void> {
        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            new Notice('Could not parse date from filename');
            return;
        }

        // Find the previous note date based on the note type
        const prevDate = getPreviousDate(date, stream.noteType);
        
        // Find or create the previous note
        const prevNoteName = formatDateForFilename(prevDate, stream.dateFormat);
        const prevNotePath = `${stream.folderPath}/${prevNoteName}.md`;
        
        const prevFile = this.app.vault.getAbstractFileByPath(prevNotePath);
        
        if (prevFile instanceof TFile) {
            await this.app.workspace.openLinkText(prevFile.path, '', false);
        } else {
            // Ask if the user wants to create the note
            const createNote = confirm(`Note ${prevNoteName}.md does not exist. Create it?`);
            
            if (createNote) {
                await this.createNewNote(stream, prevDate);
            }
        }
    }

    /**
     * Navigate to the next note in the chronological sequence
     */
    async navigateToNextNote(file: TFile, stream: NoteStream): Promise<void> {
        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            new Notice('Could not parse date from filename');
            return;
        }

        // Find the next note date based on the note type
        const nextDate = getNextDate(date, stream.noteType);
        
        // Find or create the next note
        const nextNoteName = formatDateForFilename(nextDate, stream.dateFormat);
        const nextNotePath = `${stream.folderPath}/${nextNoteName}.md`;
        
        const nextFile = this.app.vault.getAbstractFileByPath(nextNotePath);
        
        if (nextFile instanceof TFile) {
            await this.app.workspace.openLinkText(nextFile.path, '', false);
        } else {
            // Ask if the user wants to create the note
            const createNote = confirm(`Note ${nextNoteName}.md does not exist. Create it?`);
            
            if (createNote) {
                await this.createNewNote(stream, nextDate);
            }
        }
    }

    /**
     * Update the chronological links in a note
     */
    async updateNoteLinks(file: TFile, stream: NoteStream): Promise<void> {
        // Prevent recursive updates
        if (this.isUpdating) {
            return;
        }

        const date = parseDateFromFilename(file.basename, stream.dateFormat);
        if (!date) {
            new Notice(`Could not parse date from filename ${file.basename}`);
            return;
        }

        // Find previous and next notes
        const prevDate = getPreviousDate(date, stream.noteType);
        const nextDate = getNextDate(date, stream.noteType);
        
        const prevNoteName = formatDateForFilename(prevDate, stream.dateFormat);
        const nextNoteName = formatDateForFilename(nextDate, stream.dateFormat);
        
        // Set the updating flag to prevent recursive updates
        this.isUpdating = true;
        
        try {
            // Update frontmatter
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                if (stream.overwriteExisting || !frontmatter[stream.beforeFieldName]) {
                    // Check if the previous note exists
                    let prevNotePath = `${stream.folderPath}/${prevNoteName}.md`;
                    const allFiles = this.app.vault.getMarkdownFiles();
                    
                    // Check if a file with the same basename already exists in the folder.
                    for (const file of allFiles) {
                        if (file.basename === prevNoteName && file.path.startsWith(stream.folderPath)) {
                            prevNotePath = file.path;
                            break;
                        }
                    }

                    const prevNoteExists = this.app.vault.getAbstractFileByPath(prevNotePath) instanceof TFile;
                    
                    if (prevNoteExists) {
                        frontmatter[stream.beforeFieldName] = `[[${prevNotePath}|${prevNoteName}]]`;
                    } else {
                        // Remove the field if the note doesn't exist
                        if (frontmatter[stream.beforeFieldName]) {
                            delete frontmatter[stream.beforeFieldName];
                        }
                    }
                }
                
                if (stream.overwriteExisting || !frontmatter[stream.afterFieldName]) {
                    // Check if the next note exists
                    let nextNotePath = `${stream.folderPath}/${nextNoteName}.md`;
                    const allFiles = this.app.vault.getMarkdownFiles();

                    // Check if a file with the same basename already exists in the folder.
                    for (const file of allFiles) {
                        if (file.basename === nextNoteName && file.path.startsWith(stream.folderPath)) {
                            nextNotePath = file.path;
                            break;
                        }
                    }

                    const nextNoteExists = this.app.vault.getAbstractFileByPath(nextNotePath) instanceof TFile;
                    
                    if (nextNoteExists) {
                        frontmatter[stream.afterFieldName] = `[[${nextNotePath}|${nextNoteName}]]`;
                    } else {
                        // Remove the field if the note doesn't exist
                        if (frontmatter[stream.afterFieldName]) {
                            delete frontmatter[stream.afterFieldName];
                        }
                    }
                }
            });

            new Notice('Updated note links');
        } finally {
            // Reset the flag regardless of success or error
            setTimeout(() => {
                this.isUpdating = false;
            }, 100); // Small delay to ensure file events are processed, unit is milliseconds
        }
    }
    
    /**
     * Handle file rename events to update references in other notes
     */
    async handleNoteRename(file: TFile, oldPath: string, noteStreams: NoteStream[]): Promise<void> {
        // Get all configured streams
        for (const stream of noteStreams) {
            // Check if the old path was in the stream's folder
            if (!oldPath.startsWith(stream.folderPath)) {
                continue;
            }
            
            // Get all notes in the folder
            const files = this.app.vault.getMarkdownFiles().filter(f => 
                f.path.startsWith(stream.folderPath)
            );
            
            // Update any references to the old filename in frontmatter
            const oldBasename = oldPath.split('/').pop()?.split('.')[0];
            
            if (oldBasename) {
                for (const noteFile of files) {
                    await this.app.fileManager.processFrontMatter(noteFile, (frontmatter) => {
                        let updated = false;
                        
                        // Check before field
                        if (frontmatter[stream.beforeFieldName]?.includes(oldBasename)) {
                            frontmatter[stream.beforeFieldName] = frontmatter[stream.beforeFieldName].replace(
                                `[[${oldBasename}]]`, 
                                `[[${file.basename}]]`
                            );
                            updated = true;
                        }
                        
                        // Check after field
                        if (frontmatter[stream.afterFieldName]?.includes(oldBasename)) {
                            frontmatter[stream.afterFieldName] = frontmatter[stream.afterFieldName].replace(
                                `[[${oldBasename}]]`, 
                                `[[${file.basename}]]`
                            );
                            updated = true;
                        }
                        
                        return updated;
                    });
                }
            }
        }
    }
    
    /**
     * Create a new note for a stream and date
     */
    async createNewNote(stream: NoteStream, date: moment.Moment): Promise<TFile | null> {
        // Ensure the folder exists
        await ensureFolderExists(this.app, stream.folderPath);
        
        // Create the filename
        const filename = formatDateForFilename(date, stream.dateFormat);
        const filePath = `${stream.folderPath}/${filename}.md`;
        
        // Check if the file already exists
        if (this.app.vault.getAbstractFileByPath(filePath)) {
            new Notice(`Note ${filename}.md already exists`);
            return null;
        }
        
        // Create initial content for the note
        let initialContent = '';
        
        // Try to use a template if specified
        if (stream.templatePath) {
            const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
            if (templateFile instanceof TFile) {
                initialContent = await this.app.vault.read(templateFile);
                
                // Process template variables
                initialContent = processTemplateVariables(initialContent, date, stream);
            }
        }
        
        // Create the file
        const file = await this.app.vault.create(filePath, initialContent);
        
        // Update links
        await this.updateNoteLinks(file, stream);
        
        // Open the file
        await this.app.workspace.openLinkText(file.path, '', false);
        
        return file;
    }

    /**
     * Update chronological links for all notes in a stream
     */
    async updateAllNoteLinks(stream: NoteStream): Promise<void> {
        // Get all markdown files in the stream folder
        const files = this.app.vault.getMarkdownFiles().filter(file => 
            file.path.startsWith(stream.folderPath + '/')
        );
        
        if (files.length === 0) {
            new Notice(`No notes found in ${stream.folderPath}`);
            return;
        }
        
        let updatedCount = 0;
        
        if (stream) {
            for (const file of files) {
                // Check if the file belongs to this stream (by checking if the date can be parsed)
                await this.updateNoteLinks(file, stream);
                updatedCount++;
            }
        }
        
        new Notice(`Updated ${updatedCount} notes in stream: ${stream.name || stream.folderPath}`);
    }
}