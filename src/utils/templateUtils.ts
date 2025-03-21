import moment from 'moment';
import { NoteStream } from '../types';
import { formatDateForFilename, getPreviousDate, getNextDate } from './dateUtils';

/**
 * Process template variables in the content string
 */
export function processTemplateVariables(template: string, date: moment.Moment, stream: NoteStream): string {
    // Replace date variables
    let processed = template
        .replace(/{{date}}/g, date.format('YYYY-MM-DD'))
        .replace(/{{date:([^}]*)}}/g, (_, format) => date.format(format))
        .replace(/{{title}}/g, formatDateForFilename(date, stream.dateFormat));
    
    // Replace stream variables
    processed = processed
        .replace(/{{stream}}/g, stream.name);
    
    // Replace relative date variables
    const prevDate = getPreviousDate(date, stream.noteType);
    const nextDate = getNextDate(date, stream.noteType);
    
    processed = processed
        .replace(/{{prevDate}}/g, formatDateForFilename(prevDate, stream.dateFormat))
        .replace(/{{nextDate}}/g, formatDateForFilename(nextDate, stream.dateFormat));
    
    return processed;
}