# MCP Module

Централизованная логика для работы с MCP (Model Context Protocol) сервером.

## Структура

```
modules/mcp/
├── index.ts           # Экспорты модуля
├── config.ts          # Общие конфигурации и константы
├── types.ts           # TypeScript типы для MCP запросов/ответов
├── http-handler.ts    # HTTP эндпоинты для Obsidian API
├── server-manager.ts  # Управление HTTP сервером
└── README.md          # Документация
```

## Использование

### В main.ts плагина

```typescript
import { McpServerManager } from './modules/mcp';

class KoraMcpPlugin extends Plugin {
  private mcpServerManager: McpServerManager;

  async onload() {
    this.mcpServerManager = new McpServerManager(this.app);
    this.mcpServerManager.startServer(this.settings.port);
  }

  onunload() {
    this.mcpServerManager?.stopServer();
  }
}
```

### В mcp-server.ts

```typescript
import { MCP_CONFIG, getMcpUrl, MCP_ENDPOINTS } from './modules/mcp/config';

const KORA_URL = getMcpUrl(MCP_CONFIG.DEFAULT_PORT);

// Использование константы эндпоинта
fetch(`${KORA_URL}${MCP_ENDPOINTS.FILES}`)
```

## Особенности

1. **Централизация**: Вся логика MCP сервера сосредоточена в одном модуле
2. **Типизация**: Общие типы для запросов и ответов
3. **Конфигурация**: Централизованные константы для URL и портов
4. **Разделение ответственности**: 
   - `McpServerManager` - управление HTTP сервером
   - `McpHttpHandler` - обработка HTTP запросов
   - `config.ts` - константы и конфигурация
   - `types.ts` - типы данных

## Эндпоинты

Все HTTP эндпоинты определены в `MCP_ENDPOINTS`:

- `/files` - список markdown файлов
- `/frontmatter` - обновление frontmatter
- `/area_frontmatters` - frontmatter для области
- `/get_frontmatter` - получение frontmatter
- `/areas` - список областей
- `/file_content` - содержимое файла
- `/automate_docs` - документация из Automate/mcp/

## Преимущества новой структуры

1. **Легкость поддержки**: Вся логика в одном месте
2. **Переиспользование**: Общие типы и константы
3. **Читаемость**: Четкое разделение ответственности
4. **Тестируемость**: Изолированные модули
5. **Расширяемость**: Легко добавлять новые эндпоинты
