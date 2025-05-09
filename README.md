# Chronolinker Plugin for Obsidian

Chronolinker is an Obsidian plugin that automates the chronological linking between notes and generates higher-level "belonging" notes that aggregate their child notes. This plugin is perfect for journals, research logs, and any notes that follow a chronological sequence.

## Features

- **Multiple Note Streams**: Configure different streams for separate categories (personal, work, research, etc.)
- **Automatic Frontmatter Linking**: Automatically adds links to previous and next notes in the sequence
- **Belonging Note Generation**: Creates parent notes (e.g., weekly notes) that aggregate child notes (e.g., daily notes)
- **Navigation Commands**: Quickly jump to the next or previous note in a sequence
- **Customizable Field Names**: Define your own frontmatter field names for previous and next note links
- **Template Support**: Use templates for new notes with variables for dates and links
- **Multiple Note Types**: Support for daily, weekly, monthly, quarterly, half-yearly, and yearly notes

## Getting Started

1. Install the plugin from the Obsidian Community Plugins browser or manually
2. Go to Settings > Chronolinker
3. Add a new note stream
4. Configure the stream with a folder path, note type, and linking options

## Configuration

### Note Streams

Each note stream represents a separate collection of chronologically linked notes. You can configure:

- **Stream Name**: A name to identify this stream
- **Folder Path**: Where your notes are stored
- **Note Type**: The granularity of the notes (daily, weekly, monthly, etc.)
- **Date Format**: The format used in filenames to identify the date
- **Auto-Linking**: Automatically update links when notes change
- **Overwrite Existing**: Whether to overwrite existing links
- **Before/After Field Names**: Frontmatter field names for chronological links

### Belonging Notes

For each stream, you can enable belonging notes to automatically generate parent notes that aggregate child notes:

- **Belonging Note Folder**: Where to store the belonging notes
- **Belonging Note Type**: The type of the parent note (e.g., weekly for daily notes)
- **Belonging Note Date Format**: Date format for parent note filenames

### Templates

You can specify a template file for new notes. The template can include variables:

- `{{date}}`: The date in YYYY-MM-DD format
- `{{date:FORMAT}}`: The date in a custom format
- `{{title}}`: The filename (without extension)
- `{{stream}}`: The name of the stream
- `{{prevDate}}`: The date of the previous note
- `{{nextDate}}`: The date of the next note

## Commands

- **Jump to Previous Note**: Navigate to the previous note in the sequence
- **Jump to Next Note**: Navigate to the next note in the sequence
- **Update Chronological Links**: Manually update the links in the current note
- **Create or Update Belonging Note**: Create or refresh the parent note for the current note
- **Create New Note**: Create a new note in a specific stream

## Examples

### Daily Journal

Configure a stream for daily notes:

- Folder Path: `Journal/Daily`
- Note Type: `Daily`
- Date Format: `YYYY-MM-DD`
- Before Field Name: `day-before`
- After Field Name: `day-after`
- Enable Belonging Notes: `true`
- Belonging Note Type: `Weekly`

This will create linked daily journal entries with weekly summary notes.

### Research Log

Configure a stream for research notes:

- Folder Path: `Research/Log`
- Note Type: `Weekly`
- Date Format: `YYYY-[W]ww`
- Before Field Name: `previous-week`
- After Field Name: `next-week`
- Enable Belonging Notes: `true`
- Belonging Note Type: `Monthly`

This will create linked weekly research logs with monthly summary notes.

## FAQ

**Q: Can I have multiple note types in the same folder?**
A: Yes, you can create multiple streams that point to the same folder but with different note types.

**Q: What happens if a referenced note doesn't exist?**
A: The plugin will not create a link to non-existent notes, but you'll have the option to create them when navigating.

**Q: Can I customize the format of the links?**
A: Currently, links are created in Obsidian's standard format: `[[filename]]`. Future versions may support additional link formats.

## Troubleshooting

- **Links not updating**: Check that the file is in the configured folder and the filename follows the configured date format
- **Belonging notes not generating**: Ensure you've enabled belonging notes for the stream
- **Navigation commands not working**: Verify the current note belongs to a configured stream

## Support

If you find a bug or have a feature request, please [create an issue](https://github.com/yourusername/obsidian-chronolinker/issues) on GitHub.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
