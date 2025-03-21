import { App, PluginSettingTab, Setting } from 'obsidian';
import { NoteStream, NoteType } from '../types';

export class ChronolinkerSettingTab extends PluginSettingTab {
    plugin: any; // Will be set to ChronolinkerPlugin

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();
        
        containerEl.createEl('h1', {text: 'Chronolinker Settings'});
        
        containerEl.createEl('h2', {text: 'Note Streams'});
        
        // Add existing streams
        this.plugin.settings.noteStreams.forEach((stream: NoteStream, index: number) => {
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