# Bot Support Documentation

The Kora MCP plugin now supports both **regular bots** (created via @BotFather) and **userbots** (personal Telegram accounts) through GramJS.

## Features

### Bot Mode vs Userbot Mode

| Feature | Bot Mode | Userbot Mode |
|---------|----------|--------------|
| **Authentication** | Bot token from @BotFather | Session string from personal account |
| **Message Sending** | ✅ Can send to chats where bot is added | ✅ Can send to any accessible chat |
| **Channel Access** | ❌ Limited to chats where bot is member | ✅ Full access to all user's chats |
| **Custom Emojis** | ❌ Limited support | ✅ Full support |
| **Direct Messages** | ❌ Cannot initiate conversations | ✅ Can send to any user |
| **Rate Limits** | ✅ Higher limits for bots | ⚠️ User account limits apply |

## Configuration

### 1. Environment Variables (Optional)

You can configure the GramJS server using environment variables in `.env`:

```bash
# Common settings
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# Bot mode settings
TELEGRAM_MODE=bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Userbot mode settings  
TELEGRAM_MODE=userbot
TELEGRAM_SESSION=your_session_string_here
```

### 2. Plugin Settings UI

1. Open Obsidian Settings
2. Go to Community Plugins → Kora MCP
3. Navigate to "GramJS Settings"
4. Enable "Use GramJS"
5. Select mode: "Bot Mode" or "Userbot Mode"
6. Configure the appropriate settings for your chosen mode

## Bot Mode Setup

### Step 1: Create a Bot with @BotFather

1. Message @BotFather on Telegram
2. Use `/newbot` command
3. Follow the prompts to name your bot
4. Copy the bot token (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### Step 2: Get Telegram API Credentials

1. Visit https://my.telegram.org/apps
2. Create a new application
3. Note your API ID and API Hash

### Step 3: Add Bot to Target Chat

1. Add your bot to the group/channel where you want to send messages
2. Get the chat ID (you can use @userinfobot or check browser developer tools)

### Step 4: Configure Plugin Settings

1. Set "GramJS Mode" to "Bot Mode"
2. Enter your Bot Token
3. Enter your API ID and API Hash
4. Enter the target chat ID
5. Test the connection

## Userbot Mode Setup

(Same as before - see existing documentation)

## API Endpoints

The GramJS server provides these endpoints for both modes:

### Configuration
- `POST /config` - Update server configuration
- `GET /health` - Health check with mode information

### Messaging
- `POST /send_message` - Send text message
- `POST /send_file` - Send file
- `POST /send_note_as_image` - Send note as image

### Information
- `GET /me` - Get bot/user information
- `GET /channels` - List accessible channels (limited in bot mode)
- `GET /messages` - Get messages from channel (limited in bot mode)

### Vector Search (unchanged)
- `POST /vectorize` - Vectorize content
- `POST /search` - Search vectorized content
- And other vector endpoints...

## Usage Examples

### Send Message (Bot Mode)

```bash
curl -X POST http://127.0.0.1:8124/send_message \
  -H "Content-Type: application/json" \
  -d '{
    "peer": "-100123456789",
    "message": "Hello from bot!"
  }'
```

### Check Health

```bash
curl http://127.0.0.1:8124/health
```

Response:
```json
{
  "status": "ok",
  "connected": true,
  "mode": "bot",
  "configuredMode": "bot",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Limitations in Bot Mode

1. **Cannot send direct messages** - Bots can only send messages to:
   - Groups where the bot is added
   - Channels where the bot is an admin
   - Users who have started a conversation with the bot

2. **Limited channel access** - Bots cannot see all channels like userbots

3. **No custom emoji support** - Regular bots have limited custom emoji capabilities

4. **Cannot read message history** - Bots have limited access to historical messages

## Troubleshooting

### Bot Cannot Send Messages
- Ensure bot is added to the target chat
- Check that chat ID is correct (should be negative for groups)
- Verify bot has permission to send messages

### Configuration Not Updating
- Restart the GramJS server: `npm run gramjs-server`
- Check console for error messages
- Ensure API credentials are correct

### Connection Issues
- Test server health: `curl http://127.0.0.1:8124/health`
- Check if server is running on port 8124
- Verify firewall settings

## Migration from Userbot to Bot

1. Create bot with @BotFather
2. Add bot to target chats
3. Change mode to "Bot Mode" in settings
4. Update bot token and chat ID
5. Test connection

## Security Considerations

- **Bot tokens** are like passwords - keep them secure
- **API credentials** should not be shared or committed to repositories  
- **Bot mode** is generally safer than userbot mode for automation
- Consider using environment variables for sensitive configuration