te# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Kora MCP** (Model Context Protocol) Obsidian plugin that exposes vault data through HTTP APIs and provides GramJS userbot integration. The plugin consists of:

- **Obsidian Plugin** (`main.ts`): Main plugin with HTTP server for vault access
- **MCP Server** (`mcp-server.ts`): Standalone MCP server with tools for vault operations
- **GramJS Integration**: GramJS userbot support with custom emoji handling and message formatting
- **GramJS Server** (`gramjs-server/`): Separate Node.js process for userbot functionality
- **Modular Architecture**: Commands, UI management, and message formatting in separate modules
- **Modular Settings**: Separate setting modules for different features

## Development Commands

```bash
# Development with auto-rebuild
npm run dev

# Build for production
npm run build

# Type checking (no tests configured)
tsc -noEmit -skipLibCheck

# Watch MCP server development
npm run watch:mcp

# GramJS userbot server
npm run gramjs-server

# GramJS development with auto-reload
npm run gramjs-dev

# Version bump (updates manifest.json and versions.json)
npm run version
```

## Architecture

### Core Components

1. **KoraMcpPlugin** (`main.ts:61`): Main plugin class extending Obsidian's Plugin
   - Runs HTTP server on localhost:8123 (configurable)
   - Provides REST API endpoints for vault access
   - Coordinates between modular components
   - Handles plugin lifecycle and settings

2. **MCP Server** (`mcp-server.ts`): Standalone server using @modelcontextprotocol/sdk
   - Registers tools for vault operations (get_obsidian_files, update_frontmatter, etc.)
   - Communicates with plugin HTTP server
   - Includes GramJS userbot integration

3. **Settings Architecture** (`settings/`): Modular settings system
   - `index.ts`: Main settings tab assembling all modules
   - `ServerSettings.ts`: HTTP server configuration
   - `TelegramSettings.ts`: Bot token, chat ID, photo settings
   - `GramJsSettings.ts`: GramJS userbot configuration
   - `CustomEmojiSettings.ts`: Custom emoji mappings for Telegram

4. **GramJS Integration**: Separate Node.js process architecture
   - `gramjs-server/gramjs-server.js`: HTTP server for GramJS userbot operations
   - `gramjs-server/gramjs-auth.js`: Authentication helper for GramJS setup
   - `modules/gramjs-bridge.ts`: HTTP client for communicating with GramJS server
   - Avoids Electron/Node.js compatibility issues

5. **Modular Components** (`modules/`): Separated concerns architecture
   - `commands.ts`: Command definitions and handlers
   - `ui-manager.ts`: UI button injection and management
   - `message-formatter.ts`: Message formatting and emoji processing
   - `gramjs-bridge.ts`: HTTP bridge to GramJS server
   - `image-utils.ts`: Image processing utilities

### Key HTTP Endpoints

The plugin serves these endpoints on localhost:8123:

- `GET /files` - List all markdown files
- `POST /frontmatter` - Update frontmatter for files
- `GET /areas` - Get all areas from tags
- `POST /get_frontmatter` - Get frontmatter for specific files
- `GET /area_frontmatters` - Get Area folder frontmatter
- `POST /file_content` - Get raw file content
- `GET /automate_docs` - Get documentation from Automate/mcp/

### GramJS Integration

- **Userbot Mode**: Uses GramJS for Telegram userbot features (requires separate server)
- **File Sharing**: Can send notes as text or images
- **Custom Emojis**: Maps standard emojis to custom Telegram emoji IDs
- **Message Formatting**: Supports MarkdownV2 escaping and custom emoji entities

### GramJS Server (localhost:8124)

The GramJS server runs as a separate Node.js process and provides:

- `POST /send_message` - Send text message via userbot
- `POST /send_file` - Send file via userbot  
- `POST /send_note_as_image` - Send note content as HTML image
- `GET /me` - Get current user info
- `GET /health` - Health check endpoint
- `GET /channels` - Get all channels, groups, and chats
- `GET /messages` - Get messages from specific channel/chat between dates

## File Structure

```
main.ts              # Main plugin entry point
mcp-server.ts        # Standalone MCP server
gramjs-server/       # GramJS server directory
├── gramjs-server.js # HTTP server for GramJS userbot operations
└── gramjs-auth.js   # Authentication helper
settings/            # Modular settings components
├── index.ts         # Settings tab assembler
├── ServerSettings.ts
├── TelegramSettings.ts
├── GramJsSettings.ts
└── CustomEmojiSettings.ts
modules/             # Feature modules
├── commands.ts      # Command definitions and handlers
├── ui-manager.ts    # UI button injection and management
├── message-formatter.ts # Message formatting and emoji processing
├── gramjs-bridge.ts # HTTP bridge to GramJS server
└── image-utils.ts   # Image processing utilities
lib/
└── obsidian.ts      # Obsidian API wrappers
docs/                # Documentation
├── GRAMJS_SETUP.md  # GramJS setup instructions
└── *.md            # Architecture and integration docs
```

## Important Notes

- Plugin serves HTTP API on localhost:8123 by default (security: local only)
- GramJS server runs on localhost:8124 as separate Node.js process
- MCP server communicates with plugin HTTP server, not Obsidian API directly
- Settings are persistent through Obsidian's plugin data system
- GramJS requires API credentials from Telegram and separate server process
- Modular architecture allows for easy extension and maintenance

## GramJS Setup

For GramJS userbot setup, see `docs/GRAMJS_SETUP.md` for detailed instructions including:
- Getting Telegram API credentials
- Running the GramJS server
- Configuring authentication
- Setting up chat IDs

## Dependencies

Key dependencies:
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `telegram`: GramJS userbot library
- `express`: HTTP server for GramJS service
- `cors`: CORS middleware for GramJS server
- `zod`: Schema validation for MCP tools
- `obsidian`: Obsidian plugin API

## Configuration

Settings are managed through:
1. Plugin settings tab in Obsidian
2. Default settings in `main.ts:26`
3. Modular setting components in `settings/`

The plugin automatically handles settings persistence and validation.