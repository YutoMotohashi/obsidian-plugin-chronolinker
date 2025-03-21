import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, addIcon, normalizePath } from 'obsidian';
import moment from 'moment';

// Define note types
enum NoteType {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  HALF_YEAR = 'half_year',
  YEAR = 'year'
}

// Interface for note stream configuration
interface NoteStream {
  id: string;
  name: string;
  folderPath: string;
  noteType: NoteType;
  dateFormat: string;
  autoLinking: boolean;
  overwriteExisting: boolean;
  beforeFieldName: string;
  afterFieldName: string;
  enableBelongingNotes: boolean;
  belongingNoteFolder: string;
  belongingNoteType: NoteType;
  belongingNoteDateFormat: string;
  templatePath: string;
}

interface ChronolinkerSettings {
  noteStreams: NoteStream[];
}

const DEFAULT_SETTINGS: ChronolinkerSettings = {
  noteStreams: []
}

export default class ChronolinkerPlugin extends Plugin {
  settings: ChronolinkerSettings;

  async onload() {
    console.log('Loading Chronolinker plugin');
    await this.loadSettings();

    // Add settings tab
    this.addSettingTab(new ChronolinkerSettingTab(this.app, this));

    // Add ribbon icon
    this.addRibbonIcon('links-going-out', 'Chronolinker', (evt: MouseEvent) => {
      new Notice('Chronolinker is active!');
    });

    // Register commands
    this.addCommands();

    // Set up event handlers for file modifications
    this.registerFileEvents();
  }

  onunload() {
    console.log('Unloading Chronolinker plugin');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  addCommands() {
    // Jump to previous note
    this.addCommand({
      id: 'jump-to-previous-note',
      name: 'Jump to Previous Note',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          if (!checking) {
            this.navigateToPreviousNote(activeView.file);
          }
          return true;
        }
        return false;
      }
    });

    // Jump to next note
    this.addCommand({
      id: 'jump-to-next-note',
      name: 'Jump to Next Note',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          if (!checking) {
            this.navigateToNextNote(activeView.file);
          }
          return true;
        }
        return false;
      }
    });

    // Update note links
    this.addCommand({
      id: 'update-note-links',
      name: 'Update Chronological Links',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          if (!checking) {
            this.updateNoteLinks(activeView.file);
          }
          return true;
        }
        return false;
      }
    });

    // Create belonging note
    this.addCommand({
      id: 'create-belonging-note',
      name: 'Create or Update Belonging Note',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          if (!checking) {
            this.createOrUpdateBelongingNote(activeView.file);
          }
          return true;
        }
        return false;
      }
    });

    // Create new note for a stream
    this.addCommand({
      id: 'create-new-note',
      name: 'Create New Note',
      callback: () => {
        new CreateNoteModal(this.app, this).open();
      }
    });
  }

  registerFileEvents() {
    // Handle file creation
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.handleNewNoteCreation(file);
        }
      })
    );

    // Handle file modification
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          // Check if we need to update links
          this.checkAndUpdateLinks(file);
        }
      })
    );

    // Handle file rename
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          // Update links in other notes that reference this file
          this.handleNoteRename(file, oldPath);
        }
      })
    );
  }

  // Navigation methods
  async navigateToPreviousNote(file: TFile) {
    const stream = this.findNoteStream(file);
    if (!stream) {
      new Notice('This note does not belong to any configured stream');
      return;
    }

    const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
    if (!date) {
      new Notice('Could not parse date from filename');
      return;
    }

    // Find the previous note date based on the note type
    const prevDate = this.getPreviousDate(date, stream.noteType);
    
    // Find or create the previous note
    const prevNoteName = this.formatDateForFilename(prevDate, stream.dateFormat);
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

  async navigateToNextNote(file: TFile) {
    const stream = this.findNoteStream(file);
    if (!stream) {
      new Notice('This note does not belong to any configured stream');
      return;
    }

    const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
    if (!date) {
      new Notice('Could not parse date from filename');
      return;
    }

    // Find the next note date based on the note type
    const nextDate = this.getNextDate(date, stream.noteType);
    
    // Find or create the next note
    const nextNoteName = this.formatDateForFilename(nextDate, stream.dateFormat);
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

  // Link update methods
  async updateNoteLinks(file: TFile) {
    const stream = this.findNoteStream(file);
    if (!stream) {
      new Notice('This note does not belong to any configured stream');
      return;
    }

    const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
    if (!date) {
      new Notice('Could not parse date from filename');
      return;
    }

    // Find previous and next notes
    const prevDate = this.getPreviousDate(date, stream.noteType);
    const nextDate = this.getNextDate(date, stream.noteType);
    
    const prevNoteName = this.formatDateForFilename(prevDate, stream.dateFormat);
    const nextNoteName = this.formatDateForFilename(nextDate, stream.dateFormat);
    
    // Update frontmatter
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (stream.overwriteExisting || !frontmatter[stream.beforeFieldName]) {
        // Check if the previous note exists
        const prevNotePath = `${stream.folderPath}/${prevNoteName}.md`;
        const prevNoteExists = this.app.vault.getAbstractFileByPath(prevNotePath) instanceof TFile;
        
        if (prevNoteExists) {
          frontmatter[stream.beforeFieldName] = `[[${prevNoteName}]]`;
        } else {
          // Remove the field if the note doesn't exist
          if (frontmatter[stream.beforeFieldName]) {
            delete frontmatter[stream.beforeFieldName];
          }
        }
      }
      
      if (stream.overwriteExisting || !frontmatter[stream.afterFieldName]) {
        // Check if the next note exists
        const nextNotePath = `${stream.folderPath}/${nextNoteName}.md`;
        const nextNoteExists = this.app.vault.getAbstractFileByPath(nextNotePath) instanceof TFile;
        
        if (nextNoteExists) {
          frontmatter[stream.afterFieldName] = `[[${nextNoteName}]]`;
        } else {
          // Remove the field if the note doesn't exist
          if (frontmatter[stream.afterFieldName]) {
            delete frontmatter[stream.afterFieldName];
          }
        }
      }
    });

    new Notice('Updated note links');
  }

  // Belonging note methods
  async createOrUpdateBelongingNote(file: TFile) {
    const stream = this.findNoteStream(file);
    if (!stream || !stream.enableBelongingNotes) {
      new Notice('This note does not belong to any configured stream with belonging notes enabled');
      return;
    }

    const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
    if (!date) {
      new Notice('Could not parse date from filename');
      return;
    }

    // Determine the belonging note's date
    const belongingDate = this.getBelongingDate(date, stream.noteType, stream.belongingNoteType);
    
    // Create or get the belonging note
    const belongingNoteName = this.formatDateForFilename(belongingDate, stream.belongingNoteDateFormat);
    const belongingFolder = stream.belongingNoteFolder || stream.folderPath;
    const belongingNotePath = `${belongingFolder}/${belongingNoteName}.md`;
    
    let belongingFile = this.app.vault.getAbstractFileByPath(belongingNotePath);
    
    // Create the belonging note if it doesn't exist
    if (!(belongingFile instanceof TFile)) {
      // Ensure the folder exists
      await this.ensureFolderExists(belongingFolder);
      
      // Create initial content for the belonging note
      let initialContent = '';
      
      // Try to use a template if specified
      if (stream.templatePath) {
        const templateFile = this.app.vault.getAbstractFileByPath(stream.templatePath);
        if (templateFile instanceof TFile) {
          initialContent = await this.app.vault.read(templateFile);
          
          // Process template variables
          initialContent = this.processTemplateVariables(initialContent, belongingDate, stream);
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

  // Event handler methods
  async handleNewNoteCreation(file: TFile) {
    const stream = this.findNoteStream(file);
    if (!stream || !stream.autoLinking) {
      return;
    }

    // Wait a moment to ensure file is fully created
    setTimeout(() => {
      this.updateNoteLinks(file);
      
      // Also update previous and next notes if they exist
      const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
      if (date) {
        const prevDate = this.getPreviousDate(date, stream.noteType);
        const nextDate = this.getNextDate(date, stream.noteType);
        
        const prevNoteName = this.formatDateForFilename(prevDate, stream.dateFormat);
        const nextNoteName = this.formatDateForFilename(nextDate, stream.dateFormat);
        
        const prevNotePath = `${stream.folderPath}/${prevNoteName}.md`;
        const nextNotePath = `${stream.folderPath}/${nextNoteName}.md`;
        
        const prevFile = this.app.vault.getAbstractFileByPath(prevNotePath);
        const nextFile = this.app.vault.getAbstractFileByPath(nextNotePath);
        
        if (prevFile instanceof TFile) {
          this.updateNoteLinks(prevFile);
        }
        
        if (nextFile instanceof TFile) {
          this.updateNoteLinks(nextFile);
        }
        
        // If belonging notes are enabled, update the belonging note
        if (stream.enableBelongingNotes) {
          this.createOrUpdateBelongingNote(file);
        }
      }
    }, 500);
  }

  async checkAndUpdateLinks(file: TFile) {
    const stream = this.findNoteStream(file);
    if (!stream || !stream.autoLinking) {
      return;
    }

    // Only update links if the file belongs to a configured stream
    const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
    if (date) {
      this.updateNoteLinks(file);
    }
  }

  async handleNoteRename(file: TFile, oldPath: string) {
    // Get all configured streams
    for (const stream of this.settings.noteStreams) {
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

  // Helper methods for finding related notes
  findNoteStream(file: TFile): NoteStream | null {
    // Check if the file belongs to any of the configured streams
    for (const stream of this.settings.noteStreams) {
      if (file.path.startsWith(stream.folderPath)) {
        // Try to parse the date to confirm it's a valid note for this stream
        const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
        if (date) {
          return stream;
        }
      }
    }
    
    return null;
  }

  // Date parsing and formatting helpers
  parseDateFromFilename(filename: string, format: string): moment.Moment | null {
    const date = moment(filename, format, true);
    return date.isValid() ? date : null;
  }

  formatDateForFilename(date: moment.Moment, format: string): string {
    return date.format(format);
  }

  // Helper methods for date manipulation
  getPreviousDate(date: moment.Moment, noteType: NoteType): moment.Moment {
    const clone = date.clone();
    
    switch (noteType) {
      case NoteType.DAY:
        return clone.subtract(1, 'day');
      case NoteType.WEEK:
        return clone.subtract(1, 'week');
      case NoteType.MONTH:
        return clone.subtract(1, 'month');
      case NoteType.QUARTER:
        return clone.subtract(3, 'month');
      case NoteType.HALF_YEAR:
        return clone.subtract(6, 'month');
      case NoteType.YEAR:
        return clone.subtract(1, 'year');
      default:
        return clone;
    }
  }

  getNextDate(date: moment.Moment, noteType: NoteType): moment.Moment {
    const clone = date.clone();
    
    switch (noteType) {
      case NoteType.DAY:
        return clone.add(1, 'day');
      case NoteType.WEEK:
        return clone.add(1, 'week');
      case NoteType.MONTH:
        return clone.add(1, 'month');
      case NoteType.QUARTER:
        return clone.add(3, 'month');
      case NoteType.HALF_YEAR:
        return clone.add(6, 'month');
      case NoteType.YEAR:
        return clone.add(1, 'year');
      default:
        return clone;
    }
  }

  getBelongingDate(date: moment.Moment, childType: NoteType, parentType: NoteType): moment.Moment {
    const clone = date.clone();
    
    // Calculate the parent date based on child type and parent type
    switch (parentType) {
      case NoteType.WEEK:
        return clone.startOf('week');
      case NoteType.MONTH:
        return clone.startOf('month');
      case NoteType.QUARTER:
        const quarter = Math.floor((clone.month() / 3));
        return moment().year(clone.year()).month(quarter * 3).date(1).startOf('day');
      case NoteType.HALF_YEAR:
        const halfYear = Math.floor((clone.month() / 6));
        return moment().year(clone.year()).month(halfYear * 6).date(1).startOf('day');
      case NoteType.YEAR:
        return clone.startOf('year');
      default:
        return clone;
    }
  }

  // Helper method for creating a new note
  async createNewNote(stream: NoteStream, date: moment.Moment): Promise<TFile | null> {
    // Ensure the folder exists
    await this.ensureFolderExists(stream.folderPath);
    
    // Create the filename
    const filename = this.formatDateForFilename(date, stream.dateFormat);
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
        initialContent = this.processTemplateVariables(initialContent, date, stream);
      }
    }
    
    if (!initialContent) {
      // Create basic frontmatter if no template
      initialContent = `---
title: ${filename}
---

# ${filename}

`;
    }
    
    // Create the file
    const file = await this.app.vault.create(filePath, initialContent);
    
    // Update links
    await this.updateNoteLinks(file);
    
    // Open the file
    await this.app.workspace.openLinkText(file.path, '', false);
    
    return file;
  }

  // Helper method for ensuring a folder exists
  async ensureFolderExists(folderPath: string) {
    const folders = folderPath.split('/').filter(p => p.trim());
    let currentPath = '';
    
    for (const folder of folders) {
      currentPath += folder;
      
      if (!this.app.vault.getAbstractFileByPath(currentPath)) {
        await this.app.vault.createFolder(currentPath);
      }
      
      currentPath += '/';
    }
  }

  // Helper method for updating belonging note content
  async updateBelongingNoteContent(belongingFile: TFile, stream: NoteStream) {
    // Get the belonging note date
    const belongingDate = this.parseDateFromFilename(belongingFile.basename, stream.belongingNoteDateFormat);
    if (!belongingDate) {
      return;
    }
    
    // Get the date range for child notes
    const dateRange = this.getChildDateRange(belongingDate, stream.belongingNoteType, stream.noteType);
    if (!dateRange) {
      return;
    }
    
    // Find all child notes within the date range
    const childNotes: TFile[] = [];
    const startStr = this.formatDateForFilename(dateRange.start, stream.dateFormat);
    const endStr = this.formatDateForFilename(dateRange.end, stream.dateFormat);
    
    // Get all files in the stream folder
    const files = this.app.vault.getMarkdownFiles().filter(f => 
      f.path.startsWith(stream.folderPath)
    );
    
    // Filter files that fall within the date range
    for (const file of files) {
      const date = this.parseDateFromFilename(file.basename, stream.dateFormat);
      if (date && date.isSameOrAfter(dateRange.start) && date.isSameOrBefore(dateRange.end)) {
        childNotes.push(file);
      }
    }
    
    // Sort child notes by date
    childNotes.sort((a, b) => {
      const dateA = this.parseDateFromFilename(a.basename, stream.dateFormat);
      const dateB = this.parseDateFromFilename(b.basename, stream.dateFormat);
      
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

  // Helper method for getting the date range for child notes
  getChildDateRange(parentDate: moment.Moment, parentType: NoteType, childType: NoteType) {
    // Calculate the date range for child notes
    let startDate: moment.Moment;
    let endDate: moment.Moment;
    
    switch (parentType) {
      case NoteType.WEEK:
        startDate = parentDate.clone().startOf('week');
        endDate = parentDate.clone().endOf('week');
        break;
      case NoteType.MONTH:
        startDate = parentDate.clone().startOf('month');
        endDate = parentDate.clone().endOf('month');
        break;
      case NoteType.QUARTER:
        const quarterStart = Math.floor(parentDate.month() / 3) * 3;
        startDate = moment().year(parentDate.year()).month(quarterStart).date(1).startOf('day');
        endDate = startDate.clone().add(3, 'months').subtract(1, 'day').endOf('day');
        break;
      case NoteType.HALF_YEAR:
        const halfYearStart = Math.floor(parentDate.month() / 6) * 6;
        startDate = moment().year(parentDate.year()).month(halfYearStart).date(1).startOf('day');
        endDate = startDate.clone().add(6, 'months').subtract(1, 'day').endOf('day');
        break;
      case NoteType.YEAR:
        startDate = parentDate.clone().startOf('year');
        endDate = parentDate.clone().endOf('year');
        break;
      default:
        return null;
    }
    
    return { start: startDate, end: endDate };
  }

  // Helper method for processing template variables
  processTemplateVariables(template: string, date: moment.Moment, stream: NoteStream): string {
    // Replace date variables
    let processed = template
      .replace(/{{date}}/g, date.format('YYYY-MM-DD'))
      .replace(/{{date:([^}]*)}}/g, (_, format) => date.format(format))
      .replace(/{{title}}/g, this.formatDateForFilename(date, stream.dateFormat));
    
    // Replace stream variables
    processed = processed
      .replace(/{{stream}}/g, stream.name);
    
    // Replace relative date variables
    const prevDate = this.getPreviousDate(date, stream.noteType);
    const nextDate = this.getNextDate(date, stream.noteType);
    
    processed = processed
      .replace(/{{prevDate}}/g, this.formatDateForFilename(prevDate, stream.dateFormat))
      .replace(/{{nextDate}}/g, this.formatDateForFilename(nextDate, stream.dateFormat));
    
    return processed;
  }
}

// Modal for creating a new note
class CreateNoteModal extends Modal {
  plugin: ChronolinkerPlugin;
  
  constructor(app: App, plugin: ChronolinkerPlugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen() {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: 'Create New Note' });
    
    // Stream selection
    contentEl.createEl('h3', { text: 'Select Stream' });
    
    const streamSelect = contentEl.createEl('select');
    
    // Add options for each stream
    this.plugin.settings.noteStreams.forEach(stream => {
      const option = streamSelect.createEl('option', {
        value: stream.id,
        text: stream.name
      });
    });
    
    // Date selection
    contentEl.createEl('h3', { text: 'Select Date' });
    
    const dateInput = contentEl.createEl('input', {
      type: 'date',
      value: moment().format('YYYY-MM-DD')
    });
    
    // Create button
    const createButton = contentEl.createEl('button', {
      text: 'Create',
      cls: 'mod-cta'
    });
    
    createButton.addEventListener('click', async () => {
      const streamId = streamSelect.value;
      const dateStr = dateInput.value;
      
      const stream = this.plugin.settings.noteStreams.find(s => s.id === streamId);
      
      if (stream && dateStr) {
        const date = moment(dateStr, 'YYYY-MM-DD');
        
        if (date.isValid()) {
          await this.plugin.createNewNote(stream, date);
          this.close();
        } else {
          new Notice('Invalid date');
        }
      } else {
        new Notice('Please select a stream and date');
      }
    });
    
    // Cancel button
    const cancelButton = contentEl.createEl('button', {
      text: 'Cancel'
    });
    
    cancelButton.addEventListener('click', () => {
      this.close();
    });
  }
  
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class ChronolinkerSettingTab extends PluginSettingTab {
  plugin: ChronolinkerPlugin;

  constructor(app: App, plugin: ChronolinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();
    
    containerEl.createEl('h1', {text: 'Chronolinker Settings'});
    
    containerEl.createEl('h2', {text: 'Note Streams'});
    
    // Add existing streams
    this.plugin.settings.noteStreams.forEach((stream, index) => {
      this.displayStreamSettings(containerEl, stream, index);
    });
    
    // Add button to create new stream
    new Setting(containerEl)
      .addButton(button => button
        .setButtonText('Add Note Stream')
        .setCta()
        .onClick(() => {
          const newStream: NoteStream = {
            id: String(Date.now()),
            name: 'New Stream',
            folderPath: '',
            noteType: NoteType.DAY,
            dateFormat: 'YYYY-MM-DD',
            autoLinking: true,
            overwriteExisting: false,
            beforeFieldName: 'day-before',
            afterFieldName: 'day-after',
            enableBelongingNotes: false,
            belongingNoteFolder: '',
            belongingNoteType: NoteType.WEEK,
            belongingNoteDateFormat: 'YYYY-[W]ww',
            templatePath: ''
          };
          
          this.plugin.settings.noteStreams.push(newStream);
          this.plugin.saveSettings().then(() => {
            this.display();
          });
        }));
  }

  displayStreamSettings(containerEl: HTMLElement, stream: NoteStream, index: number) {
    const streamEl = containerEl.createDiv();
    streamEl.addClass('stream-settings');
    
    streamEl.createEl('h3', {text: stream.name || 'Unnamed Stream'});
    
    new Setting(streamEl)
      .setName('Stream Name')
      .setDesc('A name to identify this note stream')
      .addText(text => text
        .setValue(stream.name)
        .onChange(async (value) => {
          stream.name = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(streamEl)
      .setName('Folder Path')
      .setDesc('Path to the folder containing notes for this stream')
      .addText(text => text
        .setValue(stream.folderPath)
        .setPlaceholder('Example: Daily Notes/Personal')
        .onChange(async (value) => {
          stream.folderPath = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(streamEl)
      .setName('Note Type')
      .setDesc('The type of notes in this stream')
      .addDropdown(dropdown => dropdown
        .addOptions({
          'day': 'Daily',
          'week': 'Weekly',
          'month': 'Monthly',
          'quarter': 'Quarterly',
          'half_year': 'Half-Yearly',
          'year': 'Yearly'
        })
        .setValue(stream.noteType)
        .onChange(async (value: string) => {
          stream.noteType = value as NoteType;
          await this.plugin.saveSettings();
          
          // Update field names based on note type
          if (value === 'day') {
            stream.beforeFieldName = 'day-before';
            stream.afterFieldName = 'day-after';
          } else if (value === 'week') {
            stream.beforeFieldName = 'week-before';
            stream.afterFieldName = 'week-after';
          } else if (value === 'month') {
            stream.beforeFieldName = 'month-before';
            stream.afterFieldName = 'month-after';
          } else if (value === 'quarter') {
            stream.beforeFieldName = 'quarter-before';
            stream.afterFieldName = 'quarter-after';
          } else if (value === 'half_year') {
            stream.beforeFieldName = 'half-year-before';
            stream.afterFieldName = 'half-year-after';
          } else if (value === 'year') {
            stream.beforeFieldName = 'year-before';
            stream.afterFieldName = 'year-after';
          }
          
          // Also update date format based on note type
          if (value === 'day') {
            stream.dateFormat = 'YYYY-MM-DD';
          } else if (value === 'week') {
            stream.dateFormat = 'YYYY-[W]ww';
          } else if (value === 'month') {
            stream.dateFormat = 'YYYY-MM';
          } else if (value === 'quarter') {
            stream.dateFormat = 'YYYY-[Q]Q';
          } else if (value === 'half_year') {
            stream.dateFormat = 'YYYY-[H]H';
          } else if (value === 'year') {
            stream.dateFormat = 'YYYY';
          }
          
          this.display();
        }));
    
    new Setting(streamEl)
      .setName('Date Format')
      .setDesc('Format for parsing dates from filenames')
      .addText(text => text
        .setValue(stream.dateFormat)
        .setPlaceholder('YYYY-MM-DD')
        .onChange(async (value) => {
          stream.dateFormat = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(streamEl)
      .setName('Auto-Linking')
      .setDesc('Automatically update chronological links when files change')
      .addToggle(toggle => toggle
        .setValue(stream.autoLinking)
        .onChange(async (value) => {
          stream.autoLinking = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(streamEl)
      .setName('Overwrite Existing')
      .setDesc('Overwrite existing links in frontmatter')
      .addToggle(toggle => toggle
        .setValue(stream.overwriteExisting)
        .onChange(async (value) => {
          stream.overwriteExisting = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(streamEl)
      .setName('Before Field Name')
      .setDesc('Frontmatter field name for the previous note link')
      .addText(text => text
        .setValue(stream.beforeFieldName)
        .setPlaceholder(`${stream.noteType}-before`)
        .onChange(async (value) => {
          stream.beforeFieldName = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(streamEl)
      .setName('After Field Name')
      .setDesc('Frontmatter field name for the next note link')
      .addText(text => text
        .setValue(stream.afterFieldName)
        .setPlaceholder(`${stream.noteType}-after`)
        .onChange(async (value) => {
          stream.afterFieldName = value;
          await this.plugin.saveSettings();
        }));
    
    // Belonging note settings
    new Setting(streamEl)
      .setName('Enable Belonging Notes')
      .setDesc('Generate parent notes that aggregate child notes')
      .addToggle(toggle => toggle
        .setValue(stream.enableBelongingNotes)
        .onChange(async (value) => {
          stream.enableBelongingNotes = value;
          await this.plugin.saveSettings();
          this.display();
        }));
    
    if (stream.enableBelongingNotes) {
      new Setting(streamEl)
        .setName('Belonging Note Folder')
        .setDesc('Path to the folder for belonging notes (leave empty to use the same folder)')
        .addText(text => text
          .setValue(stream.belongingNoteFolder)
          .setPlaceholder('Example: Weekly Notes')
          .onChange(async (value) => {
            stream.belongingNoteFolder = value;
            await this.plugin.saveSettings();
          }));
      
      new Setting(streamEl)
        .setName('Belonging Note Type')
        .setDesc('The type of the belonging/parent notes')
        .addDropdown(dropdown => dropdown
          .addOptions({
            'week': 'Weekly',
            'month': 'Monthly',
            'quarter': 'Quarterly',
            'half_year': 'Half-Yearly',
            'year': 'Yearly'
          })
          .setValue(stream.belongingNoteType)
          .onChange(async (value: string) => {
            stream.belongingNoteType = value as NoteType;
            await this.plugin.saveSettings();
            
            // Update date format based on belonging note type
            if (value === 'week') {
              stream.belongingNoteDateFormat = 'YYYY-[W]ww';
            } else if (value === 'month') {
              stream.belongingNoteDateFormat = 'YYYY-MM';
            } else if (value === 'quarter') {
              stream.belongingNoteDateFormat = 'YYYY-[Q]Q';
            } else if (value === 'half_year') {
              stream.belongingNoteDateFormat = 'YYYY-[H]H';
            } else if (value === 'year') {
              stream.belongingNoteDateFormat = 'YYYY';
            }
            
            this.display();
          }));
      
      new Setting(streamEl)
        .setName('Belonging Note Date Format')
        .setDesc('Format for belonging note filenames')
        .addText(text => text
          .setValue(stream.belongingNoteDateFormat)
          .setPlaceholder('YYYY-[W]ww')
          .onChange(async (value) => {
            stream.belongingNoteDateFormat = value;
            await this.plugin.saveSettings();
          }));
    }
    
    new Setting(streamEl)
      .setName('Template Path')
      .setDesc('Path to a template file for new notes in this stream')
      .addText(text => text
        .setValue(stream.templatePath)
        .setPlaceholder('Example: Templates/Daily Note')
        .onChange(async (value) => {
          stream.templatePath = value;
          await this.plugin.saveSettings();
        }));
    
    // Add button to remove this stream
    new Setting(streamEl)
      .addButton(button => button
        .setButtonText('Remove Stream')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.noteStreams.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
    
    // Add a separator
    streamEl.createEl('hr');
  }
}
