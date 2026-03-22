# Миграция репозитория к архитектуре Kora

## Цель

Привести текущий репозиторий к архитектуре:

- `Vault` — источник истины для контента и publication state
- `Kora Plugin` — интерфейс и orchestration внутри Obsidian
- `Kora Core` — общий слой логики без привязки к конкретному хосту
- `Kora Server` — серверный runtime
- `Publish Module` — общий серверный слой публикации
- `Personal Admin Module` — приватный слой для моего Telegram-контура

## Явные ограничения

Это архитектурный рефакторинг существующего репозитория.

- Не реализуем отсутствующие фичи.
- Не дописываем новые продуктовые сценарии "на будущее".
- Не меняем текущее поведение работающих фич без необходимости.
- Не открываем публикацию другим пользователям в рамках этой задачи.
- Не строим новый admin-модуль, если его сейчас фактически нет.
- Не переносим source of truth публикаций из vault на сервер.

Если в целевой архитектуре упоминается будущий модуль, это означает только:

- выделить для него место в структуре
- отделить зависимости так, чтобы потом его можно было добавить без болезненной переделки

## Ключевые решения

1. `Vault` хранит:
   - контент заметок
   - порядок публикации
   - target-ы публикации
   - связь заметки с публикацией
   - editorial/publication state
2. `Server` не становится источником истины для публикаций.
3. `Server` хранит только runtime-данные:
   - архив Telegram
   - subscriber data
   - jobs/retries/logs
   - кеши, embeddings, служебные индексы
4. Публикация для других пользователей не требует отдельного физического сервера.
5. Сначала разделяем домены и каталоги, а не процессы и деплой.

## Что уже есть в текущем репозитории

### Почти готовые кандидаты на `Kora Plugin`

- `main.ts`
- `modules/obsidian/**`
- `modules/ui-plugins/**`
- `modules/mcp/**`
- `modules/telegram/ui/**`
- `modules/vector/settings-tab.ts`
- `modules/daily-notes/**`

Это Obsidian-host код: UI, settings, команды, integration glue.

### Почти готовые кандидаты на `Kora Core`

- `modules/chunking/model/**`
- `modules/chunking/ports/**`
- `modules/semantic-inspector/ports/**`
- `modules/telegram/formatting/**`
- `modules/telegram/parsing/**`
- `modules/hosts/web/**`

Важно: не весь `modules/chunking/**` уже является core. Внутри есть и Obsidian-specific адаптеры.

### Почти готовые кандидаты на `Kora Server`

- `gramjs-server/src/routes/**`
- `gramjs-server/src/services/**`
- `gramjs-server/src/strategies/**`
- `gramjs-server/src/archive/**`
- `gramjs-server/src/semantic-sqlite/**`

### Уже просится в shared contracts

- `telegram-types.ts`

Сейчас это общий DTO-файл между plugin и server. Его нужно вынести первым.

### Пока не трогаем

- `mcp-obsidian/**`

Это вложенный отдельный продукт/репозиторий со своей архитектурой. В текущую миграцию Kora его лучше не смешивать.

## Целевая структура репозитория

```text
/
  apps/
    obsidian-plugin/
      src/
        main.ts
        settings/
        bridges/
        ui/
        mcp/
        obsidian/
    kora-server/
      src/
        modules/
          publish/
          personal-admin/
          runtime/
        routes/
        services/
        strategies/
  packages/
    kora-core/
      src/
        chunking/
        telegram/
        publishing/
        summaries/
        hosts/
    contracts/
      src/
        telegram.ts
        publishing.ts
  docs/
```

## Как сопоставить текущие каталоги с целевыми

### `apps/obsidian-plugin`

Сюда переезжает:

- `main.ts`
- `modules/mcp/**`
- `modules/obsidian/**`
- `modules/ui-plugins/**`
- `modules/telegram/ui/**`
- `modules/vector/settings-tab.ts`
- `modules/vector/types.ts`
- `modules/daily-notes/**`
- host-specific bridges:
  - `modules/telegram/transport/gramjs-bridge.ts`
  - `modules/telegram/transport/archive-bridge.ts`
  - `modules/vector/vector-bridge.ts`

### `apps/kora-server`

Сюда переезжает текущий `gramjs-server/**`, но внутри делится на модули:

- `src/modules/publish`
  - публикация заметок
  - send/edit/replace post
  - transport to Telegram / garden target
- `src/modules/personal-admin`
  - архив Telegram
  - subscriber data
  - summary входящих сообщений
  - личные admin-сценарии
- `src/modules/runtime`
  - vector/semantic storage
  - sqlite repositories
  - jobs
  - cache/logging

### `packages/contracts`

Сюда переезжают DTO и API-контракты:

- `telegram-types.ts` -> `packages/contracts/src/telegram.ts`
- будущие типы публикации -> `packages/contracts/src/publishing.ts`

### `packages/kora-core`

Сюда переезжает только логика, не требующая Obsidian API и не требующая Express/Telegram runtime напрямую:

- модели чанкинга
- порты и use case-слой
- форматирование Telegram markdown
- общие publishing contracts/use cases
- summary pipelines, если они не завязаны на конкретный runtime

## Порядок миграции

### Этап 1. Вынести contracts

Минимальный и самый безопасный шаг.

Сделать:

- создать `packages/contracts`
- перенести туда `telegram-types.ts`
- заменить импорты из `../../../telegram-types` на пакет contracts

Результат:

- plugin и server начнут зависеть от одного явно выделенного shared-слоя

### Этап 2. Разделить сервер по доменам, не меняя процесс

Не делать второй сервер. Только навести порядок внутри текущего.

Сделать в `gramjs-server`:

- `src/modules/publish/**`
- `src/modules/personal-admin/**`
- `src/modules/runtime/**`

Разложить:

- `send-message.ts`, `edit-message.ts`, `send-file.ts` -> `publish`
- `archive/**`, `archive-*.ts` routes -> `personal-admin`
- `semantic-sqlite/**`, `vector_*`, `search.ts`, `content.ts` -> `runtime`

Результат:

- общий publish-слой будет отделен от личной Telegram-админки

### Этап 3. Отделить host-specific код плагина от core

Сделать:

- выделить `packages/kora-core`
- переносить туда только pure/model/use-case слои
- оставить в plugin все bridges, settings, Notice, App, TFile, WorkspaceLeaf

Первый кандидат на extraction:

- `modules/chunking/model/**`
- `modules/chunking/ports/**`

Второй кандидат:

- `modules/telegram/formatting/**`
- `modules/telegram/parsing/**`

### Этап 4. Перенести plugin в `apps/obsidian-plugin`

Это уже структурный шаг.

Сделать:

- перенести исходники plugin в `apps/obsidian-plugin/src`
- root build оставить совместимым с Obsidian
- root `main.js`, `styles.css`, `manifest.json` пока остаются publish-артефактами для Obsidian

Важно:

Репозиторий сейчас лежит внутри `.obsidian/plugins/obsidian-kora`. Поэтому физический переезд исходников допустим, пока итоговые артефакты продолжают собираться в корень плагина.

### Этап 5. Переименовать `gramjs-server` в `apps/kora-server`

Делать только после этапов 1-3.

Причина:

- сначала разделяем ответственность
- потом уже меняем внешний layout

## Что не нужно делать сейчас

1. Не выделять `Publish Module` в отдельный деплой/процесс.
2. Не выносить publication state из vault в server DB.
3. Не пытаться сразу превратить все `modules/**` в reusable packages.
4. Не смешивать текущую миграцию с `mcp-obsidian/**`.
5. Не строить multi-tenant hosted backend до разделения модулей внутри текущего сервера.
6. Не реализовывать отсутствующие personal/admin/publishing фичи только потому, что под них появилось место в архитектуре.

## Первые практические PR-шаги

### PR 1

Статус: выполнено.

- создать `packages/contracts`
- перенести `telegram-types.ts`
- поправить импорты plugin/server

Фактически сделано:

- канонический файл контрактов создан в `packages/contracts/src/telegram.ts`
- старый `telegram-types.ts` оставлен как compatibility shim
- plugin и server переведены на импорт из `packages/contracts`

### PR 2

Статус: выполнено.

- внутри `gramjs-server/src` создать `modules/publish`, `modules/personal-admin`, `modules/runtime`
- разложить по ним routes/services без изменения поведения

Фактически сделано:

- `publish` выделен в `gramjs-server/src/modules/publish/**`
- `personal-admin` выделен в `gramjs-server/src/modules/personal-admin/**`
- `runtime` выделен в `gramjs-server/src/modules/runtime/**`
- `server.ts` теперь регистрирует модули через `registerPublishRoutes`, `registerRuntimeRoutes`, `registerPersonalAdminRoutes`
- старые пути в `routes/**` и `services/**` сохранены как compatibility shims там, где это нужно для безопасного перехода

### PR 3

Статус: выполнено.

- выделить `packages/kora-core/src/chunking`
- перенести туда model/ports для chunking
- оставить Obsidian adapter в plugin

Фактически сделано:

- создан `packages/kora-core/src/chunking/**`
- `modules/chunking/model/**` для pure chunking-логики вынесен в `kora-core`
- `modules/chunking/ports/chunk-transport-port.ts` вынесен в `kora-core`
- `modules/chunking/index.ts` превращён в compatibility shim поверх `kora-core` и локальных Obsidian-адаптеров
- Obsidian-specific файлы (`adapters`, `obsidian-cache`, UI) оставлены в plugin-слое
- несколько локальных импортов `Chunk`/`chunkNote` переведены на новый shared entrypoint, чтобы убрать лишнюю связность через старый barrel

### PR 4

Статус: частично выполнено.

- выделить `packages/kora-core/src/telegram`
- перенести formatting/parsing

Фактически сделано:

- создан `packages/kora-core/src/telegram/**`
- в `kora-core` вынесен чистый foundation Telegram-логики:
  - `core/constants`
  - `utils/validator`
  - `formatting/inline-formatter`
  - `formatting/markdown-to-telegram-converter`
- в `kora-core` вынесены pure helper-функции для ссылок:
  - `links/link-parser`
  - `generateTelegramPostUrl`
  - разбор markdown/obsidian links без `App` и `TFile`
- в `kora-core` вынесен pure parsing helper-слой:
  - `parsing/base-file-parser`
  - `parsing/channel-file-parser`
  - `parsing/post-file-parser`
  - frontmatter validation/extraction без зависимости на Obsidian runtime
- `TelegramMessageFormatter` больше не зависит от `LinkParser` и file lookup, но сам пока оставлен в plugin-слое как compatibility-обертка
- старые пути в `modules/telegram/**` оставлены как compatibility shims там, где это безопасно
- `FileParser`, `ChannelFileParser`, `PostFileParser` сохранены как Obsidian-adapter-классы поверх shared parsing helpers
- в adapter-слое возвращена минимальная compatibility-совместимость `PostFileParser` для старых вызовов
- host-specific код (`LinkParser` как Obsidian-adapter, `ObsidianTelegramFormatter`, adapter-часть `parsing/**`) пока оставлен в plugin-слое

Почему не весь PR 4 сразу:

- текущие adapter-классы `parsing/**` и adapter-часть `LinkParser` завязаны на `obsidian`, `TFile`, vault operations и file lookup
- перенос их "как есть" в shared package привёл бы к ложной архитектуре, где `kora-core` продолжает зависеть от Obsidian runtime
- для полного переноса `parsing` нужен отдельный шаг: сначала отделить pure parsing/link model от file-system и vault adapter-слоя

### PR 5

- перенести plugin source в `apps/obsidian-plugin/src`
- обновить build-скрипты

## Как вести рефакторинг

Предпочтительный режим:

- маленькие PR
- без изменения поведения
- с проверкой сборки после каждого шага

Порядок работы:

1. Сначала выделять contracts.
2. Потом разносить код по каталогам внутри текущих runtime.
3. Потом выносить pure-слои в shared packages.
4. Только в конце менять внешний layout репозитория.

Правило для каждого шага:

- если шаг одновременно меняет архитектуру и поведение, шаг слишком большой
- если шаг требует "заодно дописать будущую фичу", шаг сформулирован неверно
- если после шага нельзя быстро собрать plugin и server, шаг слишком инвазивный

## Критерий успеха

После первых этапов должно получиться следующее:

- plugin знает про vault, UI и bridges
- server знает про publish runtime и personal admin runtime
- общий код лежит не в `main.ts` и не в корне, а в `packages`
- `Publish Module` можно открыть другим пользователям без раскрытия личной Telegram-админки
- publication state по-прежнему живет в vault
