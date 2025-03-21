import { TFile } from 'obsidian';
import moment from 'moment';

// Define note types
export enum NoteType {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  HALF_YEAR = 'half_year',
  YEAR = 'year'
}

// Interface for note stream configuration
export interface NoteStream {
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

export interface ChronolinkerSettings {
  noteStreams: NoteStream[];
}

export interface DateRange {
  start: moment.Moment;
  end: moment.Moment;
}

export const DEFAULT_SETTINGS: ChronolinkerSettings = {
  noteStreams: []
}