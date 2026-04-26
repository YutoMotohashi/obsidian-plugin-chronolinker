import { App, Editor, MarkdownView, Notice, Plugin, TFile, addIcon } from 'obsidian';
import { ChronolinkerSettings, DEFAULT_SETTINGS, NoteStream } from './types';
import { NoteManager } from './services/NoteManager';
import { BelongingNoteManager } from './services/BelongingNoteManager';
import { CreateNoteModal } from './ui/CreateNoteModal';
import { ChronolinkerSettingTab } from './ui/ChronolinkerSettingTab';
import { findNoteStream } from './utils/fileUtils';
import { StreamSelectionModal } from './ui/StreamSelectionModal';

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
    this.noteManager.setBelongingNoteManager(this.belongingNoteManager);

    // Add settings tab
    this.addSettingTab(new ChronolinkerSettingTab(this.app, this));

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
        const activeFile = activeView?.file;
        if (activeFile) {
          if (!checking) {
            const stream = findNoteStream(activeFile, this.settings.noteStreams);
            if (stream) {
              this.noteManager.navigateToPreviousNote(activeFile, stream);
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
        const activeFile = activeView?.file;
        if (activeFile) {
          if (!checking) {
            const stream = findNoteStream(activeFile, this.settings.noteStreams);
            if (stream) {
              this.noteManager.navigateToNextNote(activeFile, stream);
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
        const activeFile = activeView?.file;
        if (activeFile) {
          if (!checking) {
            const stream = findNoteStream(activeFile, this.settings.noteStreams);
            if (stream) {
              this.noteManager.updateNoteLinks(activeFile, stream);
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
      name: 'Create or Update Belonging Note for Current File',
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const activeFile = activeView?.file;
        if (activeFile) {
          if (!checking) {
            const stream = findNoteStream(activeFile, this.settings.noteStreams);
            if (stream && stream.enableBelongingNotes) {
              this.belongingNoteManager.createOrUpdateBelongingNote(activeFile, stream);
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

    this.settings.noteStreams.forEach(stream => {
      this.addCommand({
        id: `open-current-note-${stream.id}`,
        name: `Open Current Note: ${stream.name}`,
        callback: async () => {
          await this.noteManager.openCurrentNoteForStream(stream);
        }
      });

      this.addCommand({
        id: `open-current-note-${stream.id}-new-tab`,
        name: `Open Current Note In New Tab: ${stream.name}`,
        callback: async () => {
          await this.noteManager.openCurrentNoteForStream(stream, { openInNewLeaf: true });
        }
      });
    });

    // Update belonging notes for a specific stream
    this.addCommand({
      id: 'update-belonging-notes-for-stream',
      name: 'Update All Belonging Notes for a Stream',
      callback: () => {
        // Filter streams that have belonging notes enabled
        const enabledStreams = this.settings.noteStreams.filter(stream => stream.enableBelongingNotes);
        
        if (enabledStreams.length === 0) {
          new Notice('No streams have belonging notes enabled');
          return;
        }
        
        // If there's only one stream with belonging notes enabled, update it directly
        if (enabledStreams.length === 1) {
          this.belongingNoteManager.updateAllBelongingNotesForStream(enabledStreams[0]);
          return;
        }
        
        // Otherwise, show a modal to select which stream to update
        new StreamSelectionModal(this.app, enabledStreams, (selectedStream) => {
          this.belongingNoteManager.updateAllBelongingNotesForStream(selectedStream);
        }).open();
      }
    });

    // Update belonging notes for all streams
    this.addCommand({
      id: 'update-all-belonging-notes',
      name: 'Update All Belonging Notes for All Streams',
      callback: () => {
        this.belongingNoteManager.updateAllBelongingNotes(this.settings.noteStreams);
      }
    });

    // Update belonging notes for specific file's stream
    this.addCommand({
      id: 'update-belonging-notes-for-current-file-stream',
      name: "Update All Belonging Notes for Current File's Stream",
      checkCallback: (checking: boolean) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const activeFile = activeView?.file;
        if (activeFile) {
          if (!checking) {
            const stream = findNoteStream(activeFile, this.settings.noteStreams);
            if (stream && stream.enableBelongingNotes) {
              this.belongingNoteManager.updateAllBelongingNotesForStream(stream);
            } else {
              new Notice('This note does not belong to any configured stream with belonging notes enabled');
            }
          }
          return true;
        }
        return false;
      }
    });
  }

  registerFileEvents() {
    // Handle file creation
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          if (this.noteManager.shouldIgnoreCreateEvent(file.path)) {
            return;
          }
          this.handleNewNoteCreation(file);
        }
      })
    );

    // Handle file modification
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          if (this.noteManager.shouldIgnoreModifyEvent(file.path)) {
            return;
          }
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

    if (await this.noteManager.discardSafeDuplicatePlaceholder(file, stream)) {
      return;
    }

    await this.noteManager.enqueueReconcile(file, stream, {
      updateBelonging: stream.enableBelongingNotes,
      interactive: false,
      reason: 'create-event',
      managedFieldMode: 'conservative'
    });
  }

  async checkAndUpdateLinks(file: TFile) {
    const stream = findNoteStream(file, this.settings.noteStreams);
    if (!stream || !stream.autoLinking) {
      return;
    }

    if (await this.noteManager.discardSafeDuplicatePlaceholder(file, stream)) {
      return;
    }

    this.noteManager.scheduleReconcile(file, stream, {
      updateBelonging: false,
      interactive: false,
      reason: 'modify-event',
      managedFieldMode: 'conservative'
    });
  }
}
