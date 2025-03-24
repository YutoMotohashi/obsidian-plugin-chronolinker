import { App, TFile } from 'obsidian';
import { NoteStream } from '../types';
import { parseDateFromFilename } from './dateUtils';

/**
 * Ensure a folder exists, creating it if necessary
 */
export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
    const folders = folderPath.split('/').filter(p => p.trim());
    let currentPath = '';
    
    for (const folder of folders) {
        currentPath += folder;
        
        if (!app.vault.getAbstractFileByPath(currentPath)) {
            await app.vault.createFolder(currentPath);
        }
        
        currentPath += '/';
    }
}

/**
 * Find the note stream that a file belongs to
 */
export function findNoteStream(file: TFile, noteStreams: NoteStream[]): NoteStream | null {
    // Check if the file belongs to any of the configured streams
    for (const stream of noteStreams) {
        if (file.path.startsWith(`${stream.folderPath}/`)) {
            // Try to parse the date to confirm it's a valid note for this stream
            const date = parseDateFromFilename(file.basename, stream.dateFormat);
            if (date) {
                return stream;
            }
        }
    }
    
    return null;
}