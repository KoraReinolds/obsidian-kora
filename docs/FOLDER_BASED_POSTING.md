# Folder-Based Telegram Posting System

## Overview

The folder-based Telegram posting system allows you to configure different Telegram bots and channels for different folders in your Obsidian vault. This uses a settings-based approach for maximum flexibility.

## Configuration

### Setting up Folder Configurations

1. Go to Settings → Kora MCP Plugin → Telegram Settings
2. Navigate to the "Folder-based Posting Configuration" section
3. Click "Add Configuration" to create a new folder configuration
4. Configure each folder with:
   - **Folder Path**: The folder where files should have Telegram posting buttons
   - **Bot Token**: The Telegram bot token for this folder
   - **Channels**: Multiple channels with custom names and IDs

### Channel Configuration

For each folder, you can add multiple channels:
- **Channel Name**: Display name shown on the posting button
- **Channel ID**: Telegram channel ID (e.g., `@mychannel` or `-1001234567890`)

## How It Works

### Button Display Logic

Telegram posting buttons only appear for files that are located in configured folders:
- Files in configured folders → Show buttons for that folder's channels
- Files outside configured folders → No Telegram buttons (use GramJS commands if needed)
- No configuration → No Telegram buttons

### Frontmatter Structure

The system uses a simple frontmatter structure:

```yaml
post_ids:
  "@mychannel": 123
  "-1001234567890": 456
```

The `post_ids` object maps channel IDs to message IDs for tracking published posts.

### Bot API vs GramJS

- **Folder-based posting**: Uses Telegram Bot API (proper bot functionality)
- **GramJS commands**: Uses GramJS (userbot functionality)

This allows you to use official Telegram bots for folder-based posting, while GramJS commands remain available for advanced use cases.

## Button Behavior

### New Post
- Button shows `📤 Channel Name`
- Posts new message to Telegram
- Saves message ID to `post_ids`

### Update Existing Post
- Button shows `✏️ Channel Name`
- Updates existing Telegram message
- Uses saved message ID from `post_ids`

## Setup Guide

### Initial Setup

1. Set up folder configurations in settings
2. Create bot tokens via @BotFather
3. Configure channels and permissions
4. Test posting to ensure everything works

### Bot Setup

1. Create a Telegram bot via @BotFather
2. Get the bot token
3. Add the bot to your channels as an admin
4. Configure the bot token in folder settings

## Examples

### Example Configuration

```
Folder: "Blog Posts"
Bot Token: "123456789:ABC-DEF..."
Channels:
  - Name: "Main Blog"
    ID: "@myblog"
  - Name: "Draft Channel"
    ID: "-1001234567890"
```

### Example Usage

1. Create a note in "Blog Posts" folder
2. Two buttons appear: "📤 Main Blog" and "📤 Draft Channel"
3. Click "📤 Main Blog" to post
4. Button changes to "✏️ Main Blog" for future edits
5. Frontmatter gets updated with:
   ```yaml
   post_ids:
     "@myblog": 123
   ```

## Troubleshooting

### Buttons Not Appearing
- Check if file is in a configured folder
- Verify folder path matches exactly
- Ensure bot token is configured

### Posting Errors
- Verify bot token is valid
- Check if bot has admin permissions in the channel
- Confirm channel ID format is correct

### Common Issues
- Ensure bot has admin permissions in channels
- Verify folder paths match exactly (case sensitive)
- Check that bot tokens are correctly configured
