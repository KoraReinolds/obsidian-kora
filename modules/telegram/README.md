# Telegram Module

Модуль для интеграции с Telegram, включающий конвертацию Markdown заметок в формат Telegram API.

## Основные компоненты

### MarkdownToTelegramConverter

Основной класс для конвертации Markdown заметок в формат, совместимый с Telegram API.

#### Возможности:
- ✅ Удаление frontmatter из заметок
- ✅ Удаление H1 заголовков
- ✅ Конвертация MD форматирования в Telegram entities
- ✅ Поддержка bold, italic, code, strikethrough
- ✅ Обработка ссылок и code blocks
- ✅ Ограничение длины сообщений (4096 символов)
- ✅ Валидация результатов

#### Пример использования:

```typescript
import { markdownToTelegramConverter } from './modules/telegram';

const markdownContent = `---
title: "My Note"
---

# Title

This is **bold** and *italic* text with \`code\`.
`;

const result = markdownToTelegramConverter.convert(markdownContent);
console.log(result.text); // Текст без frontmatter и H1, с entities
console.log(result.entities); // Массив Telegram entities для форматирования
```

#### Опции конвертации:

```typescript
interface ConversionOptions {
  removeFrontmatter?: boolean;   // По умолчанию: true
  removeH1Headers?: boolean;     // По умолчанию: true  
  maxLength?: number;           // По умолчанию: 4096
  preserveCodeBlocks?: boolean; // По умолчанию: true
  preserveLinks?: boolean;      // По умолчанию: true
}
```

### MessageFormatter

Расширенный класс для форматирования сообщений с поддержкой кастомных эмодзи и интеграцией markdown конвертера.

#### Новые методы:

```typescript
// Форматировать заметку с заголовком
formatMarkdownNote(fileName: string, markdownContent: string, options?: ConversionOptions): ConversionResult

// Конвертировать только содержимое
convertMarkdownToTelegram(markdownContent: string, options?: ConversionOptions): ConversionResult

// Получить прямой доступ к конвертеру
getMarkdownConverter(): MarkdownToTelegramConverter
```

#### Пример использования:

```typescript
import { MessageFormatter } from './modules/telegram';

const formatter = new MessageFormatter();
const result = formatter.formatMarkdownNote("My Note.md", markdownContent);

// result.text будет содержать: "📝 *My Note.md*\n\nконвертированный текст"
// result.entities будет содержать entities с правильными offset'ами
```

## Поддерживаемые Markdown элементы

| Markdown | Telegram Result | Entity Type |
|----------|----------------|-------------|
| `**bold**` | bold text | `bold` |
| `*italic*` | italic text | `italic` |
| `__bold__` | bold text | `bold` |
| `_italic_` | italic text | `italic` |
| `` `code` `` | code text | `code` |
| `~~strike~~` | strike text | `strikethrough` |
| `[text](url)` | text | `text_link` |
| `# Header` | (удаляется) | - |
| `## Header` | **Header** | `bold` |
| ` ```code``` ` | code | `pre` |

## Ограничения и особенности

1. **Длина сообщения**: Максимум 4096 символов (лимит Telegram)
2. **H1 заголовки**: Удаляются по умолчанию (обычно дублируют название файла)
3. **Frontmatter**: Удаляется автоматически
4. **Entities offset**: Автоматически пересчитываются при изменении текста
5. **Усечение текста**: Происходит по границам слов когда возможно

## Файлы модуля

- `markdown-to-telegram-converter.ts` - Основной конвертер
- `message-formatter.ts` - Форматтер сообщений (обновлен)
- `markdown-converter-example.ts` - Примеры использования
- `gramjs-bridge.ts` - Мост для GramJS
- `image-utils.ts` - Утилиты для изображений
- `index.ts` - Экспорты модуля


## Интеграция с существующим кодом

Конвертер интегрирован с существующим `MessageFormatter` и доступен через:

1. **Прямое использование**: `markdownToTelegramConverter.convert()`
2. **Через MessageFormatter**: `formatter.formatMarkdownNote()`
3. **Singleton экземпляр**: `markdownToTelegramConverter`

Все изменения обратно совместимы с существующим API.
