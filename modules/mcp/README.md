# MCP Module

Централизованная логика для работы с MCP (Model Context Protocol) сервером.

## Структура

```
modules/mcp/
├── index.ts                  # Экспорты модуля
├── config.ts                 # Общие конфигурации и константы
├── types.ts                  # TypeScript типы для MCP запросов/ответов
├── http-handler.ts           # Универсальный HTTP обработчик
├── server-manager.ts         # Управление HTTP сервером
├── mcp-tools-generator.ts    # Автогенерация MCP инструментов
├── endpoints/                # 🚀 ОБЪЕДИНЕННЫЕ КЛИЕНТ-СЕРВЕР ЭНДПОИНТЫ
│   ├── index.ts             # Экспорт всех эндпоинтов
│   ├── base.ts              # Базовый класс для эндпоинтов
│   ├── files.ts             # /files-get эндпоинт (клиент + сервер)
│   ├── frontmatter.ts       # /frontmatter эндпоинт (клиент + сервер)
│   ├── get-frontmatter.ts   # /get_frontmatter эндпоинт (клиент + сервер)
│   ├── file-content.ts      # /file_content эндпоинт (клиент + сервер)
│   └── automate-docs.ts     # /automate_docs эндпоинт (клиент + сервер)
└── README.md                # Документация
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
import { McpToolsGenerator, MCP_CONFIG, getMcpUrl } from './modules/mcp';

const KORA_URL = getMcpUrl(MCP_CONFIG.DEFAULT_PORT);

// 🚀 Автоматическая регистрация всех инструментов
McpToolsGenerator.registerAllTools(server, KORA_URL);
```

## 🔥 Ключевая особенность: Объединенные эндпоинты

Каждый файл в `endpoints/` содержит **ПОЛНУЮ ЛОГИКУ** эндпоинта:

### Пример: `endpoints/files-get.ts`

```typescript
export class FilesEndpoint extends BaseEndpoint {
	// Метаданные
	path = '/files-get';
	method = 'GET';
	description = 'Return markdown files from vault';
	toolName = 'get_obsidian_files';

	// 🔧 СЕРВЕРНАЯ ЛОГИКА (Obsidian plugin)
	async handler(app: App, input: any): Promise<string[]> {
		return await getMarkdownFiles(app);
	}

	// 🌐 КЛИЕНТСКАЯ ЛОГИКА (MCP tool)
	async mcpTool(baseUrl: string, input: any) {
		const res = await fetch(`${baseUrl}${this.path}`);
		const files = await res.json();
		return {
			content: [
				{ type: 'text', text: `Retrieved ${files.length} files ✅` },
				{ type: 'text', text: JSON.stringify(files, null, 2) },
			],
		};
	}
}
```

## 🚀 Революционные преимущества

### 1. **Объединенная разработка**

- **Клиент и сервер в одном файле** - редактируете API сразу с двух сторон
- **Автосинхронизация** - изменения в эндпоинте автоматически применяются везде
- **Единый источник правды** - один файл = один эндпоинт

### 2. **Автоматическая генерация**

- **Нулевой boilerplate** - `mcp-server.ts` генерируется автоматически
- **Типобезопасность** - TypeScript схемы синхронизированы
- **Нет дублирования** - один код для клиента и сервера

### 3. **Простота добавления эндпоинтов**

Чтобы добавить новый эндпоинт:

1. Создайте файл `endpoints/my-new-endpoint.ts`:

```typescript
export class MyNewEndpoint extends BaseEndpoint {
	path = '/my-endpoint';
	method = 'POST';
	description = 'My new awesome endpoint';
	toolName = 'my_new_tool';
	inputSchema = MySchema;

	async handler(app: App, input: MyInput): Promise<MyOutput> {
		// Серверная логика
	}
}
```

2. Добавьте в `endpoints/index.ts`:

```typescript
export { MyNewEndpoint } from './my-new-endpoint';
// и в ALL_ENDPOINTS массив
```

3. **ВСЁ!** 🎉 Эндпоинт автоматически доступен в HTTP API и MCP tools

### 4. **Отладка и мониторинг**

- Логи показывают все зарегистрированные инструменты
- Единая обработка ошибок
- Консистентные HTTP статус-коды

## До и После

### ❌ БЫЛО (раздельно):

```
mcp-server.ts     ← клиентская логика
http-handler.ts   ← серверная логика
config.ts         ← константы URL
```

### ✅ СТАЛО (объединено):

```
endpoints/files-get.ts ← ВСЯ ЛОГИКА В ОДНОМ ФАЙЛЕ!
  ├── HTTP handler
  ├── MCP tool
  ├── TypeScript схемы
  └── Метаданные
```

## Типичный рабочий процесс

1. **Открываете** `endpoints/frontmatter.ts`
2. **Видите** и серверную, и клиентскую логику
3. **Правите** сразу обе части
4. **Сохраняете** - изменения применяются автоматически ✨

Это и есть **настоящая объединенная разработка!** 🔥
