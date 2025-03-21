import { App, FuzzySuggestModal } from 'obsidian';
import { NoteStream } from '../types';

export class StreamSelectionModal extends FuzzySuggestModal<NoteStream> {
    private streams: NoteStream[];
    private onStreamSelected: (stream: NoteStream) => void;

    constructor(app: App, streams: NoteStream[], onStreamSelected: (stream: NoteStream) => void) {
        super(app);
        this.streams = streams;
        this.onStreamSelected = onStreamSelected;
        this.setPlaceholder("Select a note stream");
    }

    getItems(): NoteStream[] {
        return this.streams;
    }

    getItemText(stream: NoteStream): string {
        return stream.name || stream.folderPath;
    }

    onChooseItem(stream: NoteStream, evt: MouseEvent | KeyboardEvent): void {
        this.onStreamSelected(stream);
    }
}