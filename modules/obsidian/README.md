# Obsidian Module

Модуль `obsidian` предоставляет универсальные утилиты для взаимодействия с Obsidian vault, включая операции с файлами, frontmatter, командами и интерфейсом пользователя.

## Назначение модуля

Этот модуль является центральным компонентом для:
- **Управления файлами**: поиск, создание, перемещение, чтение файлов
- **Работы с метаданными**: чтение и обновление frontmatter
- **Операций с vault**: получение информации о структуре хранилища
- **Команд**: выполнение действий с заметками и файлами
- **Интерфейса**: создание модальных окон и универсальной системы суггестеров
- **Саджестеров**: текстовые подсказки в полях ввода

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

### 3. PluginCommands

Класс для управления командами плагина.

```typescript
import { PluginCommands } from './modules/obsidian';

const commands = new PluginCommands(app, settings, gramjsBridge);
```

#### Доступные команды:

- **`send-note-gramjs`** - Отправка заметки через GramJS userbot
- **`test-gramjs-connection`** - Тестирование соединения GramJS
- **`move-to-notes`** - Перемещение файла в папку Notes
- **`find-duplicate-creation-times`** - Поиск дублирующихся времен создания
- **`fix-duplicate-creation-times`** - Исправление дублирующихся времен создания
- **`open-related-chunks`** - Открытие связанных чанков
- **`send-note-to-channel`** - Отправка заметки в канал
- **`send-folder-notes-to-channels`** - Отправка заметок папки в каналы

### 4. Универсальная система суггестеров

#### ConfigurableSuggester

Универсальная система суггестеров, которая сокращает дублирование кода на 80% и обеспечивает консистентное поведение.

```typescript
import { SuggesterFactory, ConfigurableSuggester } from './modules/obsidian';

// Создание готовых суггестеров
const folderSuggester = SuggesterFactory.createFolderConfigSuggester(app, settings);
const channelSuggester = SuggesterFactory.createChannelSuggester(app, file, settings);
const commandSuggester = SuggesterFactory.createCommandSuggester(app);

// Создание кастомного суггестера
const customSuggester = SuggesterFactory.createCustomSuggester(app, {
  placeholder: 'Выберите элемент...',
  itemType: 'my-type',
  dataSource: {
    getItems: () => myDataService.getItems(),
    validateItems: (items) => items.length > 0 ? true : 'Нет элементов'
  },
  display: {
    getTitle: (item) => item.name,
    getSubtitle: (item) => item.description,
    getStatus: (item) => item.isActive 
      ? { text: ' • Активен', className: 'active' }
      : null
  }
});
```

#### Преимущества системы:

- ✅ **80% меньше кода** для новых типов суггестеров
- ✅ **Консистентное поведение** и стилизация
- ✅ **Легкая кастомизация** и расширение
- ✅ **Встроенная валидация** и обработка ошибок
- ✅ **Type-safe конфигурация**
- ✅ **Переиспользуемая логика отображения**

#### Доступные готовые конфигурации:

- **`createFolderConfigSuggester`** - для выбора конфигурации папки
- **`createChannelSuggester`** - для выбора канала
- **`createFolderChannelSuggester`** - для выбора канала папки
- **`createCommandSuggester`** - для выбора команды

### 6. TextInputSuggest

Базовый класс для создания текстовых подсказок в полях ввода.

```typescript
import { TextInputSuggest } from './modules/obsidian';

class CustomInputSuggest extends TextInputSuggest<MyItemType> {
  getSuggestions(inputStr: string): MyItemType[] {
    return this.items.filter(item => 
      item.name.toLowerCase().includes(inputStr.toLowerCase())
    );
  }

  renderSuggestion(item: MyItemType, el: HTMLElement): void {
    el.createEl('div', { text: item.name });
  }

  selectSuggestion(item: MyItemType): void {
    this.inputEl.value = item.name;
    this.close();
  }
}

// Использование
const inputEl = containerEl.createEl('input', { type: 'text' });
const suggester = new CustomInputSuggest(inputEl, app);
```

#### Особенности TextInputSuggest:
- **Автодополнение**: Показывает подсказки при вводе
- **Навигация клавишами**: Стрелки вверх/вниз для выбора, Enter для подтверждения
- **Автоматическое позиционирование**: Подсказки появляются под полем ввода
- **Стилизация**: Использует стандартные CSS-переменные Obsidian
- **Гибкость**: Переопределите методы для кастомной логики

### 7. Утилитарные функции

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
- **telegram** - для работы с метаданными постов и отправки сообщений
- **mcp** - для предоставления API для внешних инструментов
- **vector** - для индексации и поиска по содержимому
- **chunking** - для работы с фрагментами заметок

## Рекомендации по использованию

1. **Для получения путей файлов** используйте `getMarkdownFiles()` - быстро и эффективно
2. **Для работы с содержимым файлов** используйте `getExistingFilesByPaths()` для получения реальных `TFile`
3. **Для массовых операций** комбинируйте оба подхода: сначала пути, потом реальные файлы
4. **Для фильтрации файлов** используйте `getMarkdownFiles` с параметрами `include`/`exclude`
5. **Для работы с метаданными** создавайте экземпляр `FrontmatterUtils` один раз и переиспользуйте
6. **Для поиска файлов** используйте `findFileByName` для точного поиска по имени
7. **Для генерации URL** используйте `generateTelegramPostUrl` для создания ссылок на посты
8. **Для создания суггестеров** используйте систему `ConfigurableSuggester` через `SuggesterFactory`
9. **Для кастомизации интерфейса** создавайте собственные конфигурации `SuggesterConfig<T>`
