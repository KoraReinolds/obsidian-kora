te# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Kora MCP** (Model Context Protocol) Obsidian plugin that exposes vault data through HTTP APIs and provides GramJS userbot integration with AI-powered vector search. The plugin consists of:

- **Obsidian Plugin** (`main.ts`): Main plugin with HTTP server for vault access
- **MCP Server** (`mcp-server.ts`): Standalone MCP server with tools for vault operations
- **GramJS Integration**: GramJS userbot support with custom emoji handling and message formatting
- **GramJS Server** (`gramjs-server/`): Separate Node.js process for userbot functionality
- **Vector Search System**: AI-powered semantic search using OpenAI embeddings and Qdrant vector database
- **Modular Architecture**: Commands, UI management, and message formatting in separate modules
- **Modular Settings**: Separate setting modules for different features

## Development Commands

```bash
# Development with auto-rebuild
npm run dev

# Build for production
npm run build

# Type checking
tsc -noEmit -skipLibCheck

# Run tests
npm run test

# Watch MCP server development
npm run watch:mcp

# GramJS userbot server
npm run gramjs-server

# GramJS development with auto-reload
npm run gramjs-dev

# Development for all services (obsidian + mcp + gramjs)
npm run dev-all

# GramJS authentication setup
npm run gramjs-auth

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

4. **GramJS Integration**: Separate TypeScript Node.js process architecture
   - `gramjs-server/src/server.ts`: HTTP server for GramJS userbot operations
   - `gramjs-server/src/gramjs-auth.ts`: Authentication helper for GramJS setup
   - `gramjs-server/src/strategies/`: Bot and Userbot strategy patterns
   - `gramjs-server/src/routes/`: Modular API endpoints
   - `gramjs-server/src/services/`: Configuration and shutdown services
   - `modules/gramjs-bridge.ts`: HTTP client for communicating with GramJS server
   - Avoids Electron/Node.js compatibility issues

5. **Modular Components** (`modules/`): Organized by functional domains
   - `obsidian/`: Common Obsidian utilities (vault operations, frontmatter utils)
   - `telegram/`: Telegram integration (GramJS bridge, message formatting, image utils)
   - `vector/`: Vector search functionality (vector bridge and operations)
   - `ui/`: User interface components (commands, UI manager, note UI system)
   - `utils/`: General utilities (duplicate time fixer, etc.)
   - `chunking/`: Note parsing and chunking system (formerly note-chunker)

### Key HTTP Endpoints

The plugin serves these endpoints on localhost:8123:

- `GET /files-get` - List all markdown files
- `POST /frontmatter` - Update frontmatter for files
- `POST /get_frontmatter` - Get frontmatter for specific files
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
- `GET /me` - Get current user info
- `GET /health` - Health check endpoint
- `GET /channels` - Get all channels, groups, and chats
- `GET /messages` - Get messages from specific channel/chat between dates

**Vector Search Endpoints:**

- `POST /vectorize` - Vectorize any content (universal endpoint)
- `POST /vectorize_messages` - Vectorize Telegram messages from a channel
- `POST /search` - Search vectorized content with semantic similarity
- `GET /content/:id` - Get vectorized content by ID
- `DELETE /content/:id` - Delete vectorized content
- `GET /vector_stats` - Get vector database statistics
- `GET /vector_health` - Vector service health check

### Vector Search System

The plugin includes a comprehensive AI-powered vector search system that can index and search across multiple content types:

**Components:**

- **EmbeddingService** (`gramjs-server/src/embedding-service.ts`): OpenAI embeddings with chunking and averaging
- **VectorService** (`gramjs-server/src/vector-service.ts`): Qdrant integration with CRUD operations
- **VectorBridge** (`modules/vector/vector-bridge.ts`): TypeScript interface for vector operations
- **VectorSettings** (`settings/VectorSettings.ts`): Configuration UI with connection testing

**Supported Content Types:**

- `telegram_post` - Messages from Telegram channels/groups
- `telegram_comment` - Comments in Telegram chats
- `obsidian_note` - Notes from Obsidian vault

**Features:**

- Semantic similarity search using cosine distance
- Content deduplication via hash checking
- Batch processing for large datasets
- Filtered search by content type, channel, date, etc.
- Automatic text chunking for long content
- Idempotent operations (safe to re-run)

**Data Schema:** All content stored in single Qdrant collection with universal payload structure containing content type, metadata, and source-specific fields.

## File Structure

```
main.ts              # Main plugin entry point
mcp-server.ts        # Standalone MCP server
gramjs-server/       # GramJS TypeScript server directory
├── src/
│   ├── server.ts    # Main HTTP server
│   ├── gramjs-auth.ts # Authentication helper
│   ├── embedding-service.ts # OpenAI embeddings service
│   ├── vector-service.ts # Qdrant vector database service
│   ├── routes/      # API endpoint handlers
│   ├── services/    # Configuration and utility services
│   ├── strategies/  # Bot/Userbot strategy patterns
│   ├── types/       # Type definitions
│   └── utils/       # Utility functions
├── dist/           # Compiled JavaScript output
└── package.json    # GramJS server dependencies
settings/            # Modular settings components
├── index.ts         # Settings tab assembler
├── ServerSettings.ts
├── TelegramSettings.ts
├── GramJsSettings.ts
├── CustomEmojiSettings.ts
└── VectorSettings.ts # Vector search configuration
modules/             # Organized feature modules
├── obsidian/        # Obsidian utilities
│   ├── vault-operations.ts # File operations and management
│   ├── frontmatter-utils.ts # Frontmatter manipulation
│   └── index.ts
├── telegram/        # Telegram integration
│   ├── gramjs-bridge.ts # HTTP bridge to GramJS server
│   ├── message-formatter.ts # Message formatting and emoji processing
│   ├── image-utils.ts # Image processing utilities
│   └── index.ts
├── vector/          # Vector search
│   ├── vector-bridge.ts # HTTP bridge to vector services
│   └── index.ts
├── ui/              # User interface
│   ├── commands.ts  # Command definitions and handlers
│   ├── ui-manager.ts # UI button injection and management
│   ├── note-ui-system.ts # Note UI management system
│   └── index.ts
├── utils/           # General utilities
│   ├── duplicate-time-fixer.ts # Duplicate timestamp utilities
│   └── index.ts
├── chunking/        # Note chunking system (formerly note-chunker)
│   ├── index.ts
│   ├── model/       # Chunking logic and types
│   ├── ui/          # Chunk views and UI components
│   └── __tests__/   # Tests for chunking functionality
└── index.ts         # Main modules export
lib/
└── obsidian.ts      # Obsidian API wrappers
docs/                # Documentation
├── GRAMJS_SETUP.md  # GramJS setup instructions
├── VECTOR_USAGE.md  # Vector search usage guide
└── *.md            # Architecture and integration docs
```

## Important Notes

- Plugin serves HTTP API on localhost:8123 by default (security: local only)
- GramJS server runs on localhost:8124 (bot mode) and 8125 (userbot mode) as separate TypeScript Node.js processes
- Vector search requires Qdrant running on localhost:6333 (Docker recommended)
- OpenAI API key required for embeddings (paid service)
- MCP server communicates with plugin HTTP server, not Obsidian API directly
- Settings are persistent through Obsidian's plugin data system
- GramJS requires API credentials from Telegram and separate server process
- All vector data stored in single Qdrant collection for cross-content search
- Modular architecture allows for easy extension and maintenance
- Tests configured with Vitest for chunking module
- Dual-mode support allows bot and userbot to run simultaneously

## GramJS Setup

For GramJS userbot setup, see `docs/GRAMJS_SETUP.md` for detailed instructions including:

- Getting Telegram API credentials
- Running the GramJS server
- Configuring authentication
- Setting up chat IDs

## Dependencies

Key dependencies:

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `@qdrant/js-client-rest`: Qdrant vector database client
- `openai`: OpenAI API client for embeddings
- `telegram`: GramJS userbot library
- `express`: HTTP server for GramJS service
- `cors`: CORS middleware for GramJS server
- `crypto`: Content hashing for deduplication
- `zod`: Schema validation for MCP tools
- `obsidian`: Obsidian plugin API

## Configuration

Settings are managed through:

1. Plugin settings tab in Obsidian
2. Default settings in `main.ts:26`
3. Modular setting components in `settings/`

The plugin automatically handles settings persistence and validation.

## Module Organization

The plugin follows a domain-driven modular architecture for better organization and maintainability:

### Import Patterns

```typescript
// Import from specific modules
import { VaultOperations, FrontmatterUtils } from './modules/obsidian';
import { GramJSBridge, MessageFormatter } from './modules/telegram';
import { VectorBridge } from './modules/vector';
import { UIManager, PluginCommands } from './modules/ui';
import { DuplicateTimeFixer } from './modules/utils';
import { chunkNote } from './modules/chunking';

// Or import from main modules index
import { VaultOperations, GramJSBridge, VectorBridge } from './modules';
```

### Module Boundaries

- **obsidian/**: Core Obsidian API interactions and vault operations
- **telegram/**: All Telegram-related functionality (GramJS, formatting, emojis)
- **vector/**: Vector search and embedding operations
- **ui/**: User interface components and command definitions
- **utils/**: General utilities not specific to other domains
- **chunking/**: Note parsing, chunking, and chunk UI components

### Extension Guidelines

When adding new features:

1. Identify the appropriate functional domain
2. Add to existing module or create new module if needed
3. Update module's index.ts to export new functionality
4. Follow established patterns within each module

# Code Development Principles

## Before Writing Code

1. **Check existing implementations** - Search for similar logic in the codebase first
2. **Identify reusable patterns** - Look for existing design patterns that match your use case
3. **Ask when uncertain** - Clarify requirements for any ambiguous situations

## Code Organization

### Prefer Universal Functions

- Replace specific functions with generic ones: `getByField1()` → `getBy(field)`
- Update all existing calls when refactoring to generic functions
- Design APIs for multiple items even when single item is needed: `getItems()` vs `getItem()`

### Extract Repeated Logic

- Move duplicate code to shared modules
- Create utility functions for:
  - Error handling
  - Data processing
  - Common transformations
- Use functional programming patterns where appropriate

## Design Principles

### Future-Proof Development

- Write extensible code from the start
- Implement batch operations even if currently processing single items
- Apply design patterns proactively for scalability
- Consider future use cases when designing interfaces

### Refactoring Priority

- Universality > Backward compatibility
- DRY (Don't Repeat Yourself) > Quick fixes
- Composition > Duplication

## Code Review Checklist

- [ ] Searched for existing similar implementations
- [ ] Identified opportunities to generalize existing functions
- [ ] Extracted common logic into reusable utilities
- [ ] Designed for future extensibility
- [ ] Applied appropriate design patterns
- [ ] Clarified ambiguous requirements
