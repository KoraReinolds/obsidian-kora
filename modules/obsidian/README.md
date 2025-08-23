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

#### `getMarkdownFiles(app: App, options?: GetMarkdownFilesOptions): Promise<MarkdownFileData[]>`

Получает markdown файлы с возможностью фильтрации. **Важно**: эта функция возвращает структуру данных с путями и метаданными, а не реальные `TFile` объекты.

```typescript
import { getMarkdownFiles } from './modules/obsidian';

// Получить все markdown файлы
const allFiles = await getMarkdownFiles(app);

// Получить файлы с фильтрацией
const filteredFiles = await getMarkdownFiles(app, {
  folderPath: 'Projects/',
  include: ['*.md', '**/important/*'],
  exclude: ['**/drafts/*', '**/archive/*']
});
```

**Параметры options:**
- `folderPath?: string` - путь к папке для фильтрации
- `include?: string[]` - паттерны включения (поддерживает glob: *, **)
- `exclude?: string[]` - паттерны исключения (поддерживает glob: *, **)

**Возвращаемый тип `MarkdownFileData`:**
```typescript
interface MarkdownFileData {
  path: string;           // Полный путь к файлу
  basename: string;       // Имя файла без расширения
  stat: {                 // Статистика файла
    ctime: number;        // Время создания
    mtime: number;        // Время изменения
    size: number;         // Размер в байтах
  };
}
```

#### `getFilesByPaths(app: App, paths: string[]): (TFile | null)[]`

Получает реальные `TFile` объекты по массиву путей. Возвращает массив, где `null` означает, что файл не найден.

```typescript
import { getFilesByPaths } from './modules/obsidian';

const filePaths = ['Note1.md', 'Note2.md', 'NonExistent.md'];
const files = getFilesByPaths(app, filePaths);
// Возвращает: [TFile, TFile, null]
```

#### `getExistingFilesByPaths(app: App, paths: string[]): TFile[]`

Получает только существующие `TFile` объекты по массиву путей, фильтруя несуществующие файлы.

```typescript
import { getExistingFilesByPaths } from './modules/obsidian';

const filePaths = ['Note1.md', 'Note2.md', 'NonExistent.md'];
const existingFiles = getExistingFilesByPaths(app, filePaths);
// Возвращает: [TFile, TFile] - только существующие файлы
```

#### `getAreas(app: App): string[]`

Получает список всех областей (areas) из тегов `#area/`.

```typescript
import { getAreas } from './modules/obsidian';

const areas = getAreas(app);
// Возвращает: ['work', 'personal', 'projects']
```

#### `getAutomateDocs(app: App): Promise<MarkdownFileData[]>`

Получает все файлы документации из папки `/Automate/mcp/`.

```typescript
import { getAutomateDocs } from './modules/obsidian';

const docs = await getAutomateDocs(app);
// Возвращает массив MarkdownFileData с path, basename, stat
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

### Сценарий 1: Работа с путями и реальными файлами

```typescript
import { getMarkdownFiles, getExistingFilesByPaths } from './modules/obsidian';

// Получить пути файлов из папки
const fileData = await getMarkdownFiles(app, { folderPath: 'Projects/' });

// Получить реальные TFile объекты для работы
const realFiles = getExistingFilesByPaths(app, fileData.map(f => f.path));

// Теперь можно работать с реальными файлами
for (const file of realFiles) {
  const content = await app.vault.read(file);
  // ... обработка содержимого
}
```

### Сценарий 2: Обновление frontmatter для группы файлов

```typescript
import { FrontmatterUtils, getMarkdownFiles, getExistingFilesByPaths } from './modules/obsidian';

const frontmatterUtils = new FrontmatterUtils(app);

// Получить пути файлов
const filesData = await getMarkdownFiles(app, { folderPath: 'Projects/' });

// Получить реальные файлы
const realFiles = getExistingFilesByPaths(app, filesData.map(f => f.path));

// Обновить тег для всех файлов
for (const file of realFiles) {
  await frontmatterUtils.setFrontmatterField(file, 'status', 'in-progress');
}
```

### Сценарий 3: Поиск и анализ файлов

```typescript
import { getMarkdownFiles, getAreas } from './modules/obsidian';

// Получить все файлы с определенными тегами
const workFiles = await getMarkdownFiles(app, {
  include: ['**/work/*'],
  exclude: ['**/archive/*']
});

// Получить все области
const areas = getAreas(app);
console.log('Доступные области:', areas);
```

### Сценарий 4: Массовые операции с файлами

```typescript
import { VaultOperations, FrontmatterUtils, getMarkdownFiles, getExistingFilesByPaths } from './modules/obsidian';

const vaultOps = new VaultOperations(app);
const frontmatterUtils = new FrontmatterUtils(app);

// Получить данные файлов
const filesData = await getMarkdownFiles(app, { folderPath: 'Drafts/' });

// Получить реальные файлы
const realFiles = getExistingFilesByPaths(app, filesData.map(f => f.path));

// Переместить файлы и обновить их frontmatter
for (const file of realFiles) {
  // Переместить в архив
  await vaultOps.moveFileToFolder(file, 'Archive/2024');
  
  // Обновить статус
  await frontmatterUtils.setFrontmatterField(file, 'archived', true);
}
```

## Особенности и ограничения

### Различие между MarkdownFileData и TFile

**Важно понимать разницу:**

- **`MarkdownFileData`** - легковесная структура с путями и метаданными, возвращается `getMarkdownFiles()`
- **`TFile`** - полный объект Obsidian файла, необходим для операций чтения/записи

```typescript
// ❌ Неправильно - MarkdownFileData не имеет метода read()
const fileData = await getMarkdownFiles(app, { folderPath: 'Notes/' });
const content = await app.vault.read(fileData[0]); // Ошибка!

// ✅ Правильно - сначала получаем TFile
const fileData = await getMarkdownFiles(app, { folderPath: 'Notes/' });
const realFiles = getExistingFilesByPaths(app, fileData.map(f => f.path));
const content = await app.vault.read(realFiles[0]); // Работает!
```

### Асинхронность
- Все операции с файлами и frontmatter являются асинхронными
- Используйте `await` при вызове методов

### Обработка ошибок
- Функции для множества файлов возвращают детальную информацию об ошибках
- Отдельные операции с файлами выбрасывают исключения при ошибках

### Производительность
- `getMarkdownFiles` работает быстро, так как не читает содержимое файлов
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

1. **Для получения путей файлов** используйте `getMarkdownFiles()` - быстро и эффективно
2. **Для работы с содержимым файлов** используйте `getExistingFilesByPaths()` для получения реальных `TFile`
3. **Для массовых операций** комбинируйте оба подхода: сначала пути, потом реальные файлы
4. **Для фильтрации файлов** используйте `getMarkdownFiles` с параметрами `include`/`exclude`
5. **Для работы с метаданными** создавайте экземпляр `FrontmatterUtils` один раз и переиспользуйте
6. **Для поиска файлов** используйте `findFileByName` для точного поиска по имени
7. **Для генерации URL** используйте `generateTelegramPostUrl` для создания ссылок на посты

## Миграция с предыдущих версий

Если вы использовали `getMarkdownFiles` для получения содержимого файлов:

**Старый код:**
```typescript
const files = await getMarkdownFiles(app, { includeContent: true });
// files[0].content - содержимое файла
```

**Новый код:**
```typescript
const filesData = await getMarkdownFiles(app);
const realFiles = getExistingFilesByPaths(app, filesData.map(f => f.path));
const content = await app.vault.read(realFiles[0]);
```
