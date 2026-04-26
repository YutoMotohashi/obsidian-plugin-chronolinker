import { App, TFile } from 'obsidian';
import { NoteStream, NoteType } from '../types';
import { parseDateFromFilename } from './dateUtils';

const NOTE_TYPE_FOLDER_SEGMENTS: Record<NoteType, string> = {
    [NoteType.DAY]: 'day',
    [NoteType.WEEK]: 'week',
    [NoteType.MONTH]: 'month',
    [NoteType.QUARTER]: 'quarter',
    [NoteType.HALF_YEAR]: 'half-year',
    [NoteType.YEAR]: 'year'
};

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

export function getManagedChronologySubfolders(noteType: NoteType): string[] {
    const segment = NOTE_TYPE_FOLDER_SEGMENTS[noteType];
    return [`past-${segment}`, `future-${segment}`];
}

export function getChronologySourceForFolderPath(
    filePath: string,
    folderPath: string,
    noteType: NoteType
): 'root' | 'archive' | null {
    if (!filePath.startsWith(`${folderPath}/`)) {
        return null;
    }

    const relativePath = filePath.slice(folderPath.length + 1);
    const firstSeparatorIndex = relativePath.indexOf('/');

    if (firstSeparatorIndex === -1) {
        return 'root';
    }

    const firstSegment = relativePath.slice(0, firstSeparatorIndex);
    return getManagedChronologySubfolders(noteType).includes(firstSegment) ? 'archive' : null;
}

export function isChronologyNoteFile(file: TFile, stream: NoteStream): boolean {
    if (!parseDateFromFilename(file.basename, stream.dateFormat)) {
        return false;
    }

    return getChronologySourceForFolderPath(file.path, stream.folderPath, stream.noteType) !== null;
}

/**
 * Find the note stream that a file belongs to
 */
export function findNoteStream(file: TFile, noteStreams: NoteStream[]): NoteStream | null {
    // Check if the file belongs to any of the configured streams
    for (const stream of noteStreams) {
        if (isChronologyNoteFile(file, stream)) {
            return stream;
        }
    }
    
    return null;
}
