import moment from 'moment';
import { NoteType, DateRange } from '../types';

/**
 * Parse a date from a filename using the specified format
 */
export function parseDateFromFilename(filename: string, format: string): moment.Moment | null {
    const date = moment(filename, format, true);
    return date.isValid() ? date : null;
}

/**
 * Format a date for a filename using the specified format
 */
export function formatDateForFilename(date: moment.Moment, format: string): string {
    return date.format(format);
}

/**
 * Get the previous date based on the note type
 */
export function getPreviousDate(date: moment.Moment, noteType: NoteType): moment.Moment {
    const clone = date.clone();
    
    switch (noteType) {
        case NoteType.DAY:
            return clone.subtract(1, 'day');
        case NoteType.WEEK:
            return clone.subtract(1, 'week');
        case NoteType.MONTH:
            return clone.subtract(1, 'month');
        case NoteType.QUARTER:
            return clone.subtract(3, 'month');
        case NoteType.HALF_YEAR:
            return clone.subtract(6, 'month');
        case NoteType.YEAR:
            return clone.subtract(1, 'year');
        default:
            return clone;
    }
}

/**
 * Get the next date based on the note type
 */
export function getNextDate(date: moment.Moment, noteType: NoteType): moment.Moment {
    const clone = date.clone();
    
    switch (noteType) {
        case NoteType.DAY:
            return clone.add(1, 'day');
        case NoteType.WEEK:
            return clone.add(1, 'week');
        case NoteType.MONTH:
            return clone.add(1, 'month');
        case NoteType.QUARTER:
            return clone.add(3, 'month');
        case NoteType.HALF_YEAR:
            return clone.add(6, 'month');
        case NoteType.YEAR:
            return clone.add(1, 'year');
        default:
            return clone;
    }
}

/**
 * Get the belonging (parent) date for a child date
 */
export function getBelongingDate(date: moment.Moment, childType: NoteType, parentType: NoteType): moment.Moment {
    const clone = date.clone();
    
    // Calculate the parent date based on child type and parent type
    switch (parentType) {
        case NoteType.WEEK:
            return clone.startOf('week');
        case NoteType.MONTH:
            return clone.startOf('month');
        case NoteType.QUARTER:
            const quarter = Math.floor((clone.month() / 3));
            return moment().year(clone.year()).month(quarter * 3).date(1).startOf('day');
        case NoteType.HALF_YEAR:
            const halfYear = Math.floor((clone.month() / 6));
            return moment().year(clone.year()).month(halfYear * 6).date(1).startOf('day');
        case NoteType.YEAR:
            return clone.startOf('year');
        default:
            return clone;
    }
}

/**
 * Get the date range for child notes within a parent note
 */
export function getChildDateRange(parentDate: moment.Moment, parentType: NoteType, childType: NoteType): DateRange | null {
    // Calculate the date range for child notes
    let startDate: moment.Moment;
    let endDate: moment.Moment;
    
    switch (parentType) {
        case NoteType.WEEK:
            startDate = parentDate.clone().startOf('week');
            endDate = parentDate.clone().endOf('week');
            break;
        case NoteType.MONTH:
            startDate = parentDate.clone().startOf('month');
            endDate = parentDate.clone().endOf('month');
            break;
        case NoteType.QUARTER:
            const quarterStart = Math.floor(parentDate.month() / 3) * 3;
            startDate = moment().year(parentDate.year()).month(quarterStart).date(1).startOf('day');
            endDate = startDate.clone().add(3, 'months').subtract(1, 'day').endOf('day');
            break;
        case NoteType.HALF_YEAR:
            const halfYearStart = Math.floor(parentDate.month() / 6) * 6;
            startDate = moment().year(parentDate.year()).month(halfYearStart).date(1).startOf('day');
            endDate = startDate.clone().add(6, 'months').subtract(1, 'day').endOf('day');
            break;
        case NoteType.YEAR:
            startDate = parentDate.clone().startOf('year');
            endDate = parentDate.clone().endOf('year');
            break;
        default:
            return null;
    }
    
    return { start: startDate, end: endDate };
}