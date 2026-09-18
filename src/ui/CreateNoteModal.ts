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
        const modalEl = this.modalEl;

        modalEl.addClass('chronolinker-create-note-modal');
        contentEl.addClass('chronolinker-create-note-content');
        contentEl.empty();

        const idPrefix = `chronolinker-create-note-${Date.now().toString(36)}`;
        const streamId = `${idPrefix}-stream`;
        const currentPeriodId = `${idPrefix}-current-period`;
        const dateId = `${idPrefix}-date`;
        const countId = `${idPrefix}-count`;

        const form = contentEl.createEl('form', {
            cls: 'chronolinker-create-note-form',
            attr: { novalidate: 'true' }
        });

        const header = form.createDiv({ cls: 'chronolinker-create-note-header' });
        header.createEl('h2', {
            text: 'Create new note',
            cls: 'chronolinker-create-note-title'
        });

        const fields = form.createDiv({ cls: 'chronolinker-create-note-fields' });

        // Stream selection
        const streamGroup = fields.createDiv({
            cls: 'chronolinker-create-field-group chronolinker-create-stream-group'
        });
        streamGroup.createEl('label', {
            text: 'Stream',
            cls: 'chronolinker-create-field-label',
            attr: { for: streamId }
        });
        const streamSelect = streamGroup.createEl('select', {
            cls: 'chronolinker-create-control',
            attr: {
                id: streamId,
                required: 'true'
            }
        });

        this.plugin.settings.noteStreams.forEach((stream: NoteStream) => {
            streamSelect.createEl('option', {
                value: stream.id,
                text: stream.name
            });
        });

        // Starting period
        const periodGroup = fields.createDiv({
            cls: 'chronolinker-create-field-group chronolinker-create-period-group'
        });
        periodGroup.createEl('label', {
            text: 'Starting period',
            cls: 'chronolinker-create-field-label',
            attr: { for: dateId }
        });

        const currentPeriodLabel = periodGroup.createEl('label', {
            cls: 'chronolinker-create-check-row',
            attr: { for: currentPeriodId }
        });
        const useCurrentPeriodInput = currentPeriodLabel.createEl('input', {
            type: 'checkbox',
            attr: { id: currentPeriodId }
        });
        useCurrentPeriodInput.checked = true;
        currentPeriodLabel.createSpan({ text: 'Use current period' });

        const dateInput = periodGroup.createEl('input', {
            type: 'date',
            cls: 'chronolinker-create-control chronolinker-create-date-control',
            value: moment().format('YYYY-MM-DD'),
            attr: {
                id: dateId,
                required: 'true'
            }
        });
        dateInput.disabled = true;

        // Number of periods
        const countGroup = fields.createDiv({
            cls: 'chronolinker-create-field-group chronolinker-create-count-group'
        });
        countGroup.createEl('label', {
            text: 'Number of periods',
            cls: 'chronolinker-create-field-label',
            attr: { for: countId }
        });
        const countInput = countGroup.createEl('input', {
            type: 'number',
            cls: 'chronolinker-create-control chronolinker-create-count-control',
            value: '1',
            attr: {
                id: countId,
                min: '1',
                step: '1',
                required: 'true',
                inputmode: 'numeric'
            }
        });

        const footer = form.createDiv({ cls: 'chronolinker-create-note-footer' });
        const cancelButton = footer.createEl('button', {
            text: 'Cancel',
            cls: 'chronolinker-create-cancel-button',
            attr: { type: 'button' }
        });
        const createButton = footer.createEl('button', {
            text: 'Create',
            cls: 'mod-cta chronolinker-create-submit-button',
            attr: { type: 'submit' }
        });

        let isSubmitting = false;

        const getSelectedStream = (): NoteStream | undefined => {
            return this.plugin.settings.noteStreams.find(
                (stream: NoteStream) => stream.id === streamSelect.value
            );
        };

        const getCount = (): number => {
            return countInput.valueAsNumber;
        };

        const setSubmittingState = (submitting: boolean) => {
            isSubmitting = submitting;
            createButton.disabled = submitting;
            cancelButton.disabled = submitting;
            createButton.textContent = submitting ? 'Creating…' : 'Create';
            createButton.setAttribute('aria-busy', String(submitting));
        };

        const submit = async () => {
            if (isSubmitting) {
                return;
            }

            const dateStr = dateInput.value;
            const stream = getSelectedStream();
            const count = getCount();

            if (stream && (useCurrentPeriodInput.checked || dateStr)) {
                const date = useCurrentPeriodInput.checked
                    ? moment()
                    : moment(dateStr, 'YYYY-MM-DD');

                if (date.isValid()) {
                    if (!Number.isInteger(count) || !Number.isSafeInteger(count) || count < 1) {
                        new Notice('Periods to create must be a positive whole number');
                        return;
                    }

                    setSubmittingState(true);
                    try {
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
                    } catch (error) {
                        console.error('Chronolinker note creation failed', error);
                        new Notice('Could not create the requested note(s).');
                    } finally {
                        if (this.modalEl.isConnected) {
                            setSubmittingState(false);
                        }
                    }
                } else {
                    new Notice('Invalid date');
                }
            } else {
                new Notice('Please select a stream and date');
            }
        };

        useCurrentPeriodInput.addEventListener('change', () => {
            dateInput.disabled = useCurrentPeriodInput.checked;
        });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            void submit();
        });
        cancelButton.addEventListener('click', () => {
            if (!isSubmitting) {
                this.close();
            }
        });
        window.requestAnimationFrame(() => streamSelect.focus());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.removeClass('chronolinker-create-note-content');
        this.modalEl.removeClass('chronolinker-create-note-modal');
        contentEl.empty();
    }
}
