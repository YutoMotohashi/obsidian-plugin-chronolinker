import { App, Editor, MarkdownView, Notice, Plugin, TFile, addIcon } from 'obsidian';
import { ChronolinkerSettings, DEFAULT_SETTINGS, NoteStream } from './types';
import { NoteManager } from './services/NoteManager';
import { BelongingNoteManager } from './services/BelongingNoteManager';
import { CreateNoteModal } from './ui/CreateNoteModal';
import { ChronolinkerSettingTab } from './ui/ChronolinkerSettingTab';
import { findNoteStream } from './utils/fileUtils';

export default class ChronolinkerPlugin extends Plugin {
  settings: ChronolinkerSettings;
  noteManager: NoteManager;
  belongingNoteManager: BelongingNoteManager;

  async onload() {
    console.log('Loading Chronolinker plugin');
    await this.loadSettings();

    // Initialize service managers
    this.noteManager = new NoteManager(this.app);
    this.belongingNoteManager = new BelongingNoteManager(this.app);

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
            const stream = findNoteStream(activeView.file, this.settings.noteStreams);
            if (stream) {
              this.noteManager.navigateToPreviousNote(activeView.file, stream);
            } else {
              new Notice('This note does not belong to any configured stream');
            }
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
            const stream = findNoteStream(activeView.file, this.settings.noteStreams);
            if (stream) {
              this.noteManager.navigateToNextNote(activeView.file, stream);
            } else {
              new Notice('This note does not belong to any configured stream');
            }
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
            const stream = findNoteStream(activeView.file, this.settings.noteStreams);
            if (stream) {
              this.noteManager.updateNoteLinks(activeView.file, stream);
            } else {
              new Notice('This note does not belong to any configured stream');
            }
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
            const stream = findNoteStream(activeView.file, this.settings.noteStreams);
            if (stream && stream.enableBelongingNotes) {
              this.belongingNoteManager.createOrUpdateBelongingNote(activeView.file, stream);
            } else {
              new Notice('This note does not belong to any configured stream with belonging notes enabled');
            }
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
          this.noteManager.handleNoteRename(file, oldPath, this.settings.noteStreams);
        }
      })
    );
  }
  
  // Event handler methods
  async handleNewNoteCreation(file: TFile) {
    const stream = findNoteStream(file, this.settings.noteStreams);
    if (!stream || !stream.autoLinking) {
      return;
    }

    // Wait a moment to ensure file is fully created
    setTimeout(() => {
      this.noteManager.updateNoteLinks(file, stream);
      
      // Find and update previous and next notes if they exist
      this.updateAdjacentNotes(file, stream);
      
      // If belonging notes are enabled, update the belonging note
      if (stream.enableBelongingNotes) {
        this.belongingNoteManager.createOrUpdateBelongingNote(file, stream);
      }
    }, 500);
  }

  async checkAndUpdateLinks(file: TFile) {
    const stream = findNoteStream(file, this.settings.noteStreams);
    if (!stream || !stream.autoLinking) {
      return;
    }

    // Only update links if auto-linking is enabled for this stream
    this.noteManager.updateNoteLinks(file, stream);
  }

  // Helper method to update previous and next notes when a new note is created
  private async updateAdjacentNotes(file: TFile, stream: NoteStream) {
    const noteManager = this.noteManager;
    
    // Get all notes in the folder
    const files = this.app.vault.getMarkdownFiles().filter(f => 
      f.path.startsWith(stream.folderPath) && f !== file
    );
    
    // Check each file to see if it should link to our new file
    for (const otherFile of files) {
      const otherStream = findNoteStream(otherFile, this.settings.noteStreams);
      if (otherStream && otherStream.id === stream.id) {
        noteManager.updateNoteLinks(otherFile, stream);
      }
    }
  }
}