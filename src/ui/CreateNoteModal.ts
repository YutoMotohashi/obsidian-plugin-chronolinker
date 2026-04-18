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
        this.noteManager = plugin.noteManager;
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

        const useCurrentPeriodWrapper = contentEl.createEl('label', {
            attr: {
                style: 'display:flex; align-items:center; gap:8px; margin-bottom:8px;'
            }
        });
        const useCurrentPeriodInput = useCurrentPeriodWrapper.createEl('input', {
            type: 'checkbox'
        });
        useCurrentPeriodInput.checked = true;
        useCurrentPeriodWrapper.createSpan({ text: 'Use current period (today by default)' });
        
        const dateInput = contentEl.createEl('input', {
            type: 'date',
            value: moment().format('YYYY-MM-DD')
        });
        dateInput.disabled = true;

        useCurrentPeriodInput.addEventListener('change', () => {
            dateInput.disabled = useCurrentPeriodInput.checked;
        });

        contentEl.createEl('h3', { text: 'Periods to Create' });

        const countInput = contentEl.createEl('input', {
            type: 'number',
            value: '1'
        });
        countInput.min = '1';
        countInput.step = '1';
        countInput.style.width = '100px';

        contentEl.createEl('p', {
            text: 'Use 7 for a week of daily notes, 4 for four weekly notes, etc.'
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
            
            if (stream && (useCurrentPeriodInput.checked || dateStr)) {
                const date = useCurrentPeriodInput.checked
                    ? moment()
                    : moment(dateStr, 'YYYY-MM-DD');
                const count = Number.parseInt(countInput.value, 10);
                
                if (date.isValid()) {
                    if (Number.isNaN(count) || count < 1) {
                        new Notice('Periods to create must be at least 1');
                        return;
                    }

                    if (count === 1) {
                        await this.noteManager.openNoteForDate(stream, date, {
                            createIfMissing: true,
                            open: true,
                            reconcileIfResolved: true,
                            updateBelonging: true,
                            interactive: true
                        });
                    } else {
                        const files = await this.noteManager.ensureNoteRange(stream, date, count, {
                            createIfMissing: true,
                            reconcileIfResolved: true,
                            updateBelonging: true,
                            interactive: true
                        });
                        new Notice(`Ensured ${files.length} notes for ${stream.name}`);
                    }
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
