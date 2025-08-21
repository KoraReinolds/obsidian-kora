# Folder-Based Telegram Posting System

## Overview

The new folder-based Telegram posting system allows you to configure different Telegram bots and channels for different folders in your Obsidian vault. This replaces the old frontmatter-based channel configuration with a more flexible settings-based approach.

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
- Files outside configured folders → Show legacy GramJS buttons (if enabled)
- No configuration → No Telegram buttons

### Frontmatter Changes

The new system simplifies frontmatter structure:

**Old Format:**
```yaml
telegram_channels:
  - name: "My Channel"
    channelId: "@mychannel"
    messageId: 123
```

**New Format:**
```yaml
post_ids:
  "@mychannel": 123
  "-1001234567890": 456
```

The `post_ids` object maps channel IDs to message IDs for tracking published posts.

### Bot API vs GramJS

- **Folder-based posting**: Uses Telegram Bot API (proper bot functionality)
- **Legacy posting**: Uses GramJS (userbot functionality)

This allows you to use official Telegram bots for folder-based posting while maintaining backward compatibility with existing GramJS setups.

## Button Behavior

### New Post
- Button shows `📤 Channel Name`
- Posts new message to Telegram
- Saves message ID to `post_ids`

### Update Existing Post
- Button shows `✏️ Channel Name`
- Updates existing Telegram message
- Uses saved message ID from `post_ids`

## Migration Guide

### From Legacy System

1. Set up folder configurations in settings
2. Existing files with `telegram_channels` frontmatter will continue to work
3. New posts will use the simplified `post_ids` format
4. Gradually migrate by moving files to configured folders

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

### Migration Issues
- Old `telegram_channels` frontmatter is preserved
- New `post_ids` format is used for new posts
- Both formats can coexist during migration
