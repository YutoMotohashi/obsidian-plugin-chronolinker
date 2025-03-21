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
        const belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;
        
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
            
            if (!initialContent) {
                // Create basic frontmatter if no template
                initialContent = `---
title: ${belongingNoteName}
---

# ${belongingNoteName}

`;
            }
            
            // Create the file
            belongingFile = await this.app.vault.create(belongingNotePath, initialContent);
        }
        
        // Update the belonging note's content to include child notes
        await this.updateBelongingNoteContent(belongingFile as TFile, stream);
        
        // Open the belonging note
        await this.app.workspace.openLinkText(belongingFile.path, '', false);
        
        new Notice(`Created/updated belonging note: ${belongingNoteName}`);
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
        const startStr = formatDateForFilename(dateRange.start, stream.dateFormat);
        const endStr = formatDateForFilename(dateRange.end, stream.dateFormat);
        
        // Get all files in the stream folder
        const files = this.app.vault.getMarkdownFiles().filter(f => 
            f.path.startsWith(stream.folderPath)
        );
        
        // Filter files that fall within the date range
        for (const file of files) {
            const date = parseDateFromFilename(file.basename, stream.dateFormat);
            if (date && date.isSameOrAfter(dateRange.start) && date.isSameOrBefore(dateRange.end)) {
                childNotes.push(file);
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
        
        // Update the belonging note content
        await this.app.fileManager.processFrontMatter(belongingFile, (frontmatter) => {
            // Add the child notes to frontmatter
            frontmatter['child-notes'] = childNotes.map(f => `[[${f.basename}]]`);
            frontmatter['date-range'] = {
                start: startStr,
                end: endStr
            };
        });
        
        // Read the current content
        let content = await this.app.vault.read(belongingFile);
        
        // Look for the child notes section
        const childNotesSection = /## Child Notes\s([\s\S]*?)(?=\n## |$)/;
        const match = content.match(childNotesSection);
        
        // Create the new child notes list
        const childNotesList = childNotes.map(f => `- [[${f.basename}]]`).join('\n');
        const newChildNotesSection = `## Child Notes\n\n${childNotesList}\n`;
        
        if (match) {
            // Replace the existing section
            content = content.replace(childNotesSection, newChildNotesSection);
        } else {
            // Add the section at the end
            content += `\n${newChildNotesSection}`;
        }
        
        // Write the updated content
        await this.app.vault.modify(belongingFile, content);
    }
}