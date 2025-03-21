import { App, Modal, Notice } from 'obsidian';
import moment from 'moment';
import { NoteStream } from '../types';
import { NoteManager } from '../services/NoteManager';

export class CreateNoteModal extends Modal {
    private plugin: any; // Will be set to ChronolinkerPlugin
    private noteManager: NoteManager;
    
    constructor(app: App, plugin: any) {
        super(app);
        this.plugin = plugin;
        this.noteManager = new NoteManager(app);
    }
    
    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: 'Create New Note' });
        
        // Stream selection
        contentEl.createEl('h3', { text: 'Select Stream' });
        
        const streamSelect = contentEl.createEl('select');
        
        // Add options for each stream
        this.plugin.settings.noteStreams.forEach((stream: NoteStream) => {
            streamSelect.createEl('option', {
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
            
            const stream = this.plugin.settings.noteStreams.find((s: NoteStream) => s.id === streamId);
            
            if (stream && dateStr) {
                const date = moment(dateStr, 'YYYY-MM-DD');
                
                if (date.isValid()) {
                    await this.noteManager.createNewNote(stream, date);
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