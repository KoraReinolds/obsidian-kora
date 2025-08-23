# Obsidian Module

Модуль `obsidian` предоставляет универсальные утилиты для взаимодействия с Obsidian vault, включая операции с файлами, frontmatter, командами и интерфейсом пользователя.

## Назначение модуля

Этот модуль является центральным компонентом для:
- **Управления файлами**: поиск, создание, перемещение, чтение файлов
- **Работы с метаданными**: чтение и обновление frontmatter
- **Операций с vault**: получение информации о структуре хранилища
- **Команд**: выполнение действий с заметками и файлами
- **Интерфейса**: создание модальных окон и суггестеров

## Экспортируемые компоненты

### 1. VaultOperations

Класс для базовых операций с vault и файлами.

```typescript
import { VaultOperations } from './modules/obsidian';

const vaultOps = new VaultOperations(app);
```

#### Методы:

- **`moveFileToFolder(file: TFile, targetFolder: string): Promise<void>`**
  - Перемещает файл в указанную папку
  - Показывает уведомление об успехе/ошибке

- **`getFileContent(file: TFile): Promise<string>`**
  - Возвращает содержимое файла как строку

- **`getActiveFile(): TFile | null`**
  - Возвращает активный файл из workspace

- **`createFile(path: string, content: string): Promise<TFile>`**
  - Создает новый файл с указанным содержимым

- **`openFile(file: TFile): Promise<void>`**
  - Открывает файл в новом листе workspace

### 2. FrontmatterUtils

Класс для работы с метаданными заметок (frontmatter).

```typescript
import { FrontmatterUtils } from './modules/obsidian';

const frontmatterUtils = new FrontmatterUtils(app);
```

#### Методы для одного файла:

- **`getFrontmatter(file: TFile): Promise<any>`**
  - Возвращает frontmatter файла

- **`updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void>`**
  - Обновляет frontmatter файла

- **`getFrontmatterField(file: TFile, field: string): Promise<any>`**
  - Возвращает значение конкретного поля frontmatter

- **`setFrontmatterField(file: TFile, field: string, value: any): Promise<void>`**
  - Устанавливает значение конкретного поля frontmatter

#### Методы для множества файлов:

- **`updateFrontmatterForFiles(filePaths: string[], frontmatter: Record<string, any>): Promise<{results: Array<{file: string, status: string, message?: string}>}>`**
  - Обновляет frontmatter для списка файлов
  - Возвращает результаты операций с детальной информацией

- **`getFrontmatterForFiles(filePaths: string[]): Promise<Array<{file: string, frontmatter: any, error?: string}>>`**
  - Получает frontmatter для списка файлов
  - Возвращает массив с frontmatter каждого файла

- **`getAreaFrontmatters(): Promise<any[]>`**
  - Получает frontmatter всех файлов в папке "Area"

### 3. Утилитарные функции

#### `getMarkdownFiles(app: App, options?: {...}): Promise<any[]>`

Получает markdown файлы с возможностью фильтрации.

```typescript
import { getMarkdownFiles } from './modules/obsidian';

// Получить все markdown файлы
const allFiles = await getMarkdownFiles(app);

// Получить файлы с фильтрацией
const filteredFiles = await getMarkdownFiles(app, {
  folderPath: 'Projects/',
  includeContent: true,
  includeTitle: true,
  include: ['*.md', '**/important/*'],
  exclude: ['**/drafts/*', '**/archive/*']
});
```

**Параметры options:**
- `folderPath?: string` - путь к папке для фильтрации
- `includeContent?: boolean` - включить содержимое файлов
- `includeTitle?: boolean` - включить заголовки (первая строка)
- `include?: string[]` - паттерны включения (поддерживает glob: *, **)
- `exclude?: string[]` - паттерны исключения (поддерживает glob: *, **)

#### `getAreas(app: App): string[]`

Получает список всех областей (areas) из тегов `#area/`.

```typescript
import { getAreas } from './modules/obsidian';

const areas = getAreas(app);
// Возвращает: ['work', 'personal', 'projects']
```

#### `getAutomateDocs(app: App): Promise<any[]>`

Получает все файлы документации из папки `/Automate/mcp/` с полным содержимым.

```typescript
import { getAutomateDocs } from './modules/obsidian';

const docs = await getAutomateDocs(app);
// Возвращает массив файлов с path, basename, title, content
```

#### `findFileByName(app: App, fileName: string): TFile | null`

Находит файл по имени (с или без расширения .md).

```typescript
import { findFileByName } from './modules/obsidian';

const file = findFileByName(app, 'my-note');
// Ищет 'my-note.md' или 'my-note'
```

#### `generateTelegramPostUrl(channelId: string, messageId: number): string`

Генерирует URL для поста в Telegram.

```typescript
import { generateTelegramPostUrl } from './modules/obsidian';

const url = generateTelegramPostUrl('-1001234567890', 123);
// Возвращает: 'https://t.me/c/1234567890/123'
```

## Примеры использования

### Сценарий 1: Обновление frontmatter для группы файлов

```typescript
import { FrontmatterUtils } from './modules/obsidian';

const frontmatterUtils = new FrontmatterUtils(app);

// Обновить тег для всех файлов в папке
const files = await getMarkdownFiles(app, { folderPath: 'Projects/' });
const filePaths = files.map(f => f.path);

await frontmatterUtils.updateFrontmatterForFiles(filePaths, {
  status: 'in-progress',
  updated: new Date().toISOString()
});
```

### Сценарий 2: Поиск и анализ файлов

```typescript
import { getMarkdownFiles, getAreas } from './modules/obsidian';

// Получить все файлы с определенными тегами
const workFiles = await getMarkdownFiles(app, {
  include: ['**/work/*'],
  includeContent: true,
  includeTitle: true
});

// Получить все области
const areas = getAreas(app);
console.log('Доступные области:', areas);
```

### Сценарий 3: Массовые операции с файлами

```typescript
import { VaultOperations, FrontmatterUtils } from './modules/obsidian';

const vaultOps = new VaultOperations(app);
const frontmatterUtils = new FrontmatterUtils(app);

// Переместить файлы и обновить их frontmatter
const files = await getMarkdownFiles(app, { folderPath: 'Drafts/' });

for (const file of files) {
  // Переместить в архив
  await vaultOps.moveFileToFolder(file, 'Archive/2024');
  
  // Обновить статус
  await frontmatterUtils.setFrontmatterField(file, 'archived', true);
}
```

## Особенности и ограничения

### Асинхронность
- Все операции с файлами и frontmatter являются асинхронными
- Используйте `await` при вызове методов

### Обработка ошибок
- Функции для множества файлов возвращают детальную информацию об ошибках
- Отдельные операции с файлами выбрасывают исключения при ошибках

### Производительность
- `getMarkdownFiles` с `includeContent: true` может быть медленным для больших vault
- Используйте фильтры для ограничения количества обрабатываемых файлов

### Поддержка glob паттернов
- `*` - любая последовательность символов (кроме `/`)
- `**` - любая последовательность директорий
- Примеры: `*.md`, `**/important/*`, `**/archive/**`

## Интеграция с другими модулями

Этот модуль используется другими модулями системы:
- **telegram** - для работы с метаданными постов
- **mcp** - для предоставления API для внешних инструментов
- **vector** - для индексации и поиска по содержимому

## Рекомендации по использованию

1. **Для массовых операций** используйте функции с множественным числом (`*ForFiles`)
2. **Для фильтрации файлов** используйте `getMarkdownFiles` с параметрами `include`/`exclude`
3. **Для работы с метаданными** создавайте экземпляр `FrontmatterUtils` один раз и переиспользуйте
4. **Для поиска файлов** используйте `findFileByName` для точного поиска по имени
5. **Для генерации URL** используйте `generateTelegramPostUrl` для создания ссылок на посты
