# Кастомные эмодзи в Telegram API

## 🎨 Что такое кастомные эмодзи?

Кастомные эмодзи (Custom Emoji) - это премиум функция Telegram, которая позволяет заменять обычные эмодзи на кастомные из специальных паков. Они выглядят как обычные эмодзи, но имеют уникальный дизайн.

## 🔧 Как это работает через API?

### MessageEntity подход

Telegram API использует **MessageEntity** для обозначения кастомных эмодзи в тексте:

```json
{
  "text": "📝 Заметка с кастомным эмодзи!",
  "entities": [
    {
      "type": "custom_emoji",
      "offset": 0,
      "length": 2,
      "custom_emoji_id": "5789574674987654321"
    }
  ]
}
```

### Поля MessageEntity:
- **type**: `"custom_emoji"`
- **offset**: позиция эмодзи в тексте (0-based)
- **length**: длина эмодзи в символах (обычно 2 для UTF-16)
- **custom_emoji_id**: уникальный ID кастомного эмодзи

## 📋 Пошаговая инструкция

### 1. Получение Custom Emoji ID

**Способ A: Через @userinfobot**
1. Отправьте кастомный эмодзи боту [@userinfobot](https://t.me/userinfobot)
2. Бот пришлет JSON с информацией:
```json
{
  "message_id": 123,
  "entities": [
    {
      "type": "custom_emoji",
      "offset": 0,
      "length": 2,
      "custom_emoji_id": "5789574674987654321"
    }
  ]
}
```

**Способ B: Через свой бот**
```javascript
// В webhook обработчике
if (update.message.entities) {
  update.message.entities.forEach(entity => {
    if (entity.type === 'custom_emoji') {
      console.log('Custom emoji ID:', entity.custom_emoji_id);
    }
  });
}
```

### 2. Настройка в плагине

1. **Откройте настройки Obsidian**
2. **Kora MCP Plugin → Telegram Bot Settings**
3. **Включите "Enable Custom Emojis"**
4. **Добавьте маппинги:**
   - Standard Emoji: `📝`
   - Custom Emoji ID: `5789574674987654321`
   - Description: `Красивая записка`

### 3. Использование

Теперь все `📝` в ваших заметках будут автоматически заменены на кастомный эмодзи при отправке в Telegram!

## 🛠️ Техническая реализация

### В нашем коде:

```typescript
// 1. Обработка текста
private processCustomEmojis(text: string): { 
  processedText: string; 
  entities: MessageEntity[] 
} {
  const entities: MessageEntity[] = [];
  
  this.settings.customEmojis.forEach(mapping => {
    const regex = new RegExp(this.escapeRegExp(mapping.standard), 'g');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      entities.push({
        type: 'custom_emoji',
        offset: match.index,
        length: mapping.standard.length,
        custom_emoji_id: mapping.customId
      });
    }
  });
  
  return { processedText: text, entities };
}

// 2. Отправка сообщения
const payload = {
  chat_id: this.settings.chatId,
  text: processedText,
  parse_mode: 'MarkdownV2',
  entities: entities  // Ключевое поле!
};
```

## 📦 Популярные паки кастомных эмодзи

### Официальные паки Telegram:
- **Telegram Emoji** - стандартные эмодзи в новом стиле
- **Emoji Kitchen** - комбинированные эмодзи от Google
- **Animated Emoji** - анимированные версии

### Как найти ID паков:
1. Найдите канал с паком эмодзи
2. Отправьте любой эмодзи из пака боту @userinfobot
3. Получите custom_emoji_id

## 🎯 Практические примеры

### Пример 1: Тематические эмодзи для заметок
```
📝 → Кастомная "записка" (ID: 5789...)
✅ → Кастомная "галочка" (ID: 5790...)
❗ → Кастомный "восклицательный знак" (ID: 5791...)
```

### Пример 2: Брендированные эмодзи
```
🚀 → Логотип вашей компании (ID: 5792...)
💡 → Кастомная "лампочка идеи" (ID: 5793...)
```

### Пример 3: Сезонные эмодзи
```
🎄 → Новогодняя елка в вашем стиле (ID: 5794...)
🎃 → Хэллоуинская тыква (ID: 5795...)
```

## ⚠️ Ограничения и особенности

### Ограничения Telegram API:
- Только для Premium пользователей
- Максимум 200 кастомных эмодзи в одном сообщении
- Работает только в чатах, где разрешены кастомные эмодзи

### Ограничения нашей реализации:
- Простая замена по точному совпадению
- Один стандартный эмодзи → один кастомный
- Регистрозависимость

### Fallback поведение:
- Если кастомный эмодзи недоступен → показывается стандартный
- Если ID неверный → эмодзи игнорируется
- При ошибках → отправляется обычное сообщение

## 🔧 Отладка

### Проверка отправки:
1. Используйте кнопку **"Test Emojis"**
2. Проверьте, что эмодзи отображаются корректно
3. В случае ошибок проверьте ID в настройках

### Логи ошибок:
```javascript
// Типичные ошибки в консоли
"Bad Request: CUSTOM_EMOJI_INVALID" // Неверный ID
"Bad Request: CUSTOM_EMOJI_NOT_ALLOWED" // Нет прав на кастомные эмодзи
```

## 📚 Дополнительные ресурсы

- [Telegram Bot API - MessageEntity](https://core.telegram.org/bots/api#messageentity)
- [Telegram Premium Features](https://telegram.org/premium)
- [Custom Emoji Packs](https://t.me/stickers)
- [@userinfobot](https://t.me/userinfobot) - для получения информации об эмодзи

## 🎉 Заключение

Кастомные эмодзи позволяют сделать ваши заметки в Telegram более персонализированными и стильными. Настройте несколько основных эмодзи и наслаждайтесь результатом! 