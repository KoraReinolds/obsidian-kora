# Modular Architecture

This document describes the modular architecture of the Kora MCP plugin, designed for maintainability and extensibility.

## Core Principles

1. **Separation of Concerns**: Each module handles a specific aspect of functionality
2. **Dependency Injection**: Components receive their dependencies rather than creating them
3. **Interface-Based Design**: Modules expose clear interfaces for interaction
4. **Testability**: Modular design makes individual components easier to test

## Module Structure

### `modules/commands.ts`

- **Purpose**: Centralized command definitions and handlers
- **Responsibilities**:
  - Define all plugin commands
  - Handle command execution logic
  - Coordinate with other modules (GramJS, message formatting)
- **Dependencies**: App, Settings, GramJSBridge, MessageFormatter

### `modules/ui-manager.ts`

- **Purpose**: UI element injection and management
- **Responsibilities**:
  - Inject buttons into workspace leaves
  - Handle button styling and interactions
  - Manage UI state and cleanup
- **Dependencies**: Settings, GramJSBridge, MessageFormatter

### `modules/message-formatter.ts`

- **Purpose**: Message formatting and emoji processing
- **Responsibilities**:
  - Process custom emoji mappings
  - Format messages for Telegram
  - Handle MarkdownV2 escaping
- **Dependencies**: None (pure utility module)

### `modules/gramjs-bridge.ts`

- **Purpose**: HTTP client for GramJS server communication
- **Responsibilities**:
  - Send HTTP requests to GramJS server
  - Handle server responses and errors
  - Provide typed interfaces for GramJS operations
- **Dependencies**: None (standalone HTTP client)

## Component Interaction

```
main.ts
├── PluginCommands
│   ├── GramJSBridge
│   └── MessageFormatter
├── UIManager
│   ├── GramJSBridge
│   └── MessageFormatter
└── GramJSBridge
```

## Benefits

1. **Maintainability**: Changes to one module don't affect others
2. **Reusability**: Modules can be reused in different contexts
3. **Testability**: Each module can be tested independently
4. **Extensibility**: New features can be added as new modules
5. **Debugging**: Issues can be isolated to specific modules

## Migration from Monolithic Structure

The previous structure had all functionality in `main.ts` and `modules/telegram.ts`. The new structure:

1. **Extracted Commands**: All commands moved to `modules/commands.ts`
2. **Extracted UI Logic**: Button injection moved to `modules/ui-manager.ts`
3. **Extracted Formatting**: Message formatting moved to `modules/message-formatter.ts`
4. **Removed Telegram Bot**: Deprecated Telegram bot functionality removed
5. **Focused on GramJS**: Streamlined to use only GramJS userbot

## Future Extensions

The modular architecture allows for easy addition of new features:

1. **New Commands**: Add to `modules/commands.ts` or create new command modules
2. **New UI Elements**: Extend `modules/ui-manager.ts` or create specialized UI modules
3. **New Formatters**: Create additional formatter modules for different platforms
4. **New Bridges**: Add bridges for other services (Discord, Slack, etc.)

## Settings Integration

Each module that needs settings receives them through dependency injection:

```typescript
// Example: Command module receiving settings
constructor(app: App, settings: KoraMcpPluginSettings, gramjsBridge: GramJSBridge) {
  this.settings = settings;
  // ...
}

// Settings updates are propagated through updateSettings method
updateSettings(settings: KoraMcpPluginSettings) {
  this.settings = settings;
  // Update dependent modules
}
```

This ensures settings changes are properly propagated throughout the system.
