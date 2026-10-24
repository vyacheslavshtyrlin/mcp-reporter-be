# EPIC-002 — Отчёт через MCP Streamable HTTP

## Статус

В работе, Feature 4 — MCP Streamable HTTP завершена; следующий шаг — итоговый review Epic.

## Цель и ценность

Дать AI-клиенту первый сквозной пользовательский сценарий: найти набор данных и его поля, сформировать отчёт по World Bank, выполнить проверенные backend-расчёты и получить структурированный результат через MCP endpoint `/mcp`.

После Epic внутренний `WorldBankAdapter` станет частью законченного application flow, а не только библиотечным кодом:

```text
AI-клиент
  → MCP tools
  → application services
  → SourceRegistry
  → DataSourceAdapter
  → RecordBatch
  → чистый расчёт
  → ReportRun в памяти
  → MCP result
```

Epic соответствует этапу «Отчёт + MCP HTTP» из `mcp_reporting_design.md`.

## Входит в Epic

- `SourceRegistry`, выбирающий адаптер по `sourceId` без ветвления по конкретному источнику.
- `DatasetsModule` с application-сервисом для каталогов наборов, полей, измерений и мер.
- Runtime-контракт определения отчёта на Zod.
- Семантическая проверка определения по `DatasetSchema` и `MeasureDefinition`.
- Преобразование определения отчёта в общий `DataQuery`.
- Два вида отчёта:
  - `time_series`;
  - `period_change`.
- Чистые функции расчёта без HTTP, NestJS и хранилища.
- `ReportRun` со статусами выполнения и временным in-memory хранилищем.
- Синхронное выполнение через `InlineDispatcher` с общим deadline и `AbortSignal`.
- Официальный MCP TypeScript SDK v2 и Streamable HTTP endpoint `/mcp`.
- MCP tools:
  - `list_datasets`;
  - `describe_dataset`;
  - `list_dimension_values`;
  - `list_measures`;
  - `run_report`;
  - `get_report_run`.
- Стабильное преобразование предметных ошибок в безопасный MCP-результат.
- Unit, contract и e2e-тесты через настоящий MCP test client.
- Ручная проверка подключения к `/mcp`.

## Не входит в Epic

- PostgreSQL, Prisma и миграции.
- Сохранённые определения и их версии.
- Сохранение запусков после перезапуска процесса.
- История сопоставимых отчётов и AI summary.
- `ranking`, пользовательские формулы, произвольные aggregate-операции.
- OAuth и полноценная production-аутентификация.
- Публичный deployment, Docker и HTTPS.
- Очередь, worker, lease, outbox и Redis.
- Второй источник или `FixtureAdapter`.

Эти ограничения намеренные: сначала проверяется вертикальный сценарий «MCP → данные → расчёт → ответ», затем persistence и эксплуатационная инфраструктура добавляются отдельными Epic.

## Архитектурные границы

### SourcesModule

- Владеет `SourceRegistry` и registry адаптеров.
- Выбирает `DataSourceAdapter` по `sourceId`.
- Не содержит расчётов отчёта и MCP-specific типов.

### DatasetsModule

- Даёт application API для каталогов.
- Проверяет наличие источника и набора.
- Не знает URL или JSON-форму World Bank.

### ReportsModule

- Владеет контрактом определения отчёта и семантической проверкой.
- Преобразует определение в `DataQuery`.
- Содержит чистые расчёты `time_series` и `period_change`.
- Не вызывает MCP SDK напрямую и не хранит данные.

### ExecutionModule

- Оркестрирует получение `RecordBatch` и запуск расчёта.
- Управляет состоянием `ReportRun`.
- В этой версии использует singleton in-memory repository и inline-выполнение.
- Не содержит формул расчёта и деталей World Bank.

### McpModule

- Регистрирует tools и Streamable HTTP transport.
- Проверяет входные MCP-параметры через Zod.
- Вызывает application services и переводит ошибки в MCP result.
- Не обращается напрямую к адаптерам и не выполняет расчёты.

Nest providers создаются в одном владеющем модуле, экспортируются явно и внедряются через constructor injection. Для TypeScript-интерфейсов используются runtime-токены. Модули и providers генерируются локальным Nest CLI согласно `AGENTS.md`.

## Модель определения отчёта

Минимальный runtime-контракт:

```ts
interface ReportDefinitionInput {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly schemaVersion: number;
  readonly kind: 'time_series' | 'period_change';
  readonly filters: readonly DataFilter[];
  readonly groupBy: readonly string[];
  readonly measures: readonly { readonly id: string }[];
  readonly period: DataPeriod;
  readonly missingPolicy: 'strict_endpoints';
  readonly sort?: {
    readonly field: string;
    readonly direction: 'asc' | 'desc';
  };
}
```

TypeScript-интерфейс описывает внутренний тип, но MCP-вход сначала проверяется Zod-схемой. После структурной проверки definition дополнительно проверяется по актуальному `DatasetSchema`: существование полей и мер, допустимые операции, версия схемы, лимиты и совместимость периода.

## Правила расчётов

### time_series

- Возвращает строки по ключевым полям, группам, мерам и годам.
- Сохраняет `null`; не заменяет его нулём и не интерполирует.
- Сохраняет coverage, warnings, provenance и исходные наблюдения, необходимые для воспроизводимости.
- Применяет сортировку явно и детерминированно.

### period_change

- Для каждой группы и меры использует значения ровно в `fromYear` и `toYear`.
- Не заменяет отсутствующий endpoint ближайшим доступным годом.
- Абсолютное изменение: `end - start`.
- Относительное изменение: `(end - start) / start × 100` только для разрешённой меры и положительного `start`.
- Для процентной меры основное изменение выражается в процентных пунктах.
- При отсутствующем endpoint или недопустимом относительном расчёте результат содержит `unavailable` с машинно-читаемой причиной.
- Округление не применяется внутри расчёта; форматирование относится к представлению результата.

## Жизненный цикл ReportRun

В рамках Epic поддерживаются состояния:

```text
queued → running → completed
                 ↘ failed
```

- `run_report` создаёт `runId` и запускает выполнение inline.
- Успешный результат публикуется только после полного `RecordBatch` и завершённого расчёта.
- Ошибка источника или расчёта переводит запуск в `failed`; частичный snapshot не возвращается как completed.
- `get_report_run` читает запуск из памяти и возвращает строки с серверной пагинацией.
- После перезапуска процесса in-memory запуски теряются — это явное ограничение Epic, а не обещание persistence.
- `cancel_report_run` откладывается до этапа очереди; `AbortSignal` внутри текущего HTTP-вызова всё равно должен прерывать внешнюю загрузку.

## Features и Tasks

### Feature 1 — Registry и каталоги

- [x] **RPT-01 — Реализовать `SourceRegistry`.** Внедрить `DATA_SOURCE_ADAPTERS`, проверить уникальность `sourceId`, реализовать получение адаптера и `SOURCE_NOT_FOUND`.
- [x] **RPT-02 — Создать `DatasetsModule`.** Через Nest CLI создать module/provider, добавить application-сервис для dataset catalog и не раскрывать конкретный адаптер потребителям.
- [x] **RPT-03 — Протестировать registry и каталоги.** Использовать Nest `TestingModule`, fake adapters и общий контракт без живой сети.

### Feature 2 — Контракт и расчёты отчёта

- [x] **RPT-04 — Зафиксировать модели результата.** Описать definition, строки `time_series`, результат `period_change`, unavailable reasons и версию calculation engine.
- [x] **RPT-05 — Добавить Zod-схему definition.** Проверять структуру, непустые уникальные списки, диапазон лет и поддерживаемые значения enum.
- [x] **RPT-06 — Добавить семантическую проверку.** Сопоставлять definition с `DatasetSchema`, мерами и `allowedOperations`; формировать общий `DataQuery`.
- [x] **RPT-07 — Реализовать `time_series`.** Написать чистую функцию и unit-тесты сортировки, `null`, нескольких групп и мер.
- [x] **RPT-08 — Реализовать `period_change`.** Покрыть абсолютное и относительное изменение, процентные пункты, отсутствующие endpoints, нулевой и отрицательный start.

### Feature 3 — Выполнение в памяти

- [x] **EXEC-01 — Создать `ExecutionModule`.** Сгенерировать Nest module/providers, определить `ReportRun` и допустимые переходы состояния.
- [x] **EXEC-02 — Реализовать in-memory repository.** Хранить неизменяемые completed snapshots, поддержать получение по `runId` и пагинацию строк.
- [x] **EXEC-03 — Реализовать `ReportExecutor`.** Получить адаптер, загрузить полный `RecordBatch`, выполнить нужную чистую функцию и атомарно опубликовать результат в памяти.
- [x] **EXEC-04 — Добавить `InlineDispatcher` и deadline.** Передать `AbortSignal` по всей цепочке и не смешивать диспетчеризацию с расчётами.
- [x] **EXEC-05 — Протестировать orchestration.** Проверить completed/failed, отсутствие partial result, unknown runId и истечение deadline.

### Feature 4 — MCP Streamable HTTP

- [x] **MCP-01 — Проверить и закрепить MCP SDK v2.** Сверить актуальные версии `@modelcontextprotocol/server`, `@modelcontextprotocol/client` и нужного HTTP middleware с Node.js, TypeScript, Zod и NestJS; не использовать v1 imports.
- [x] **MCP-02 — Создать `McpModule` и `/mcp`.** Сгенерировать Nest module/provider, подключить официальный Streamable HTTP handler и корректное закрытие transport при shutdown.
- [x] **MCP-03 — Добавить catalog tools.** Реализовать четыре catalog tool через `DatasetsModule` с Zod input/output и ограниченными structured results.
- [x] **MCP-04 — Добавить `run_report`.** Проверить definition, выполнить inline и вернуть `runId`, статус, coverage, warnings и ограниченную таблицу.
- [x] **MCP-05 — Добавить `get_report_run`.** Возвращать статус и страницы строк по server cursor.
- [x] **MCP-06 — Добавить mapping ошибок.** Сохранить стабильный code, безопасное сообщение и retryability без раскрытия stack trace или внешнего payload.
- [x] **MCP-07 — Добавить MCP e2e и ручную проверку.** Поднять настоящее Nest-приложение, подключить официальный MCP client, вызвать tools через `/mcp` и проверить shutdown.

## Стратегия тестирования

- Unit-тесты чистых расчётов с полным покрытием согласованных ветвей.
- Unit-тесты Zod и семантической валидации definition.
- Nest `TestingModule` для registry, application services и executor с fake adapters.
- Contract-тесты MCP tool inputs и structured outputs.
- Минимальный e2e через настоящий Streamable HTTP transport и официальный MCP client.
- World Bank fixtures или fake adapter в автоматических тестах; живая сеть не является условием `npm run check`.
- Отдельная ручная live-проверка одного отчёта после прохождения автоматических тестов.

## Критерии приёмки Epic

- MCP-клиент подключается к `/mcp` и получает список tools.
- Catalog tools возвращают World Bank dataset, поля, страны и пять поддерживаемых мер.
- `run_report` строит `time_series` по населению выбранных стран.
- `run_report` рассчитывает `period_change` по точным endpoint-годам.
- Пропуски не превращаются в нули или ближайшие значения; coverage и warnings доступны клиенту.
- Неподдерживаемая мера или операция отклоняется до обращения к источнику.
- MCP handlers не импортируют `WorldBankAdapter` и не содержат расчётных формул.
- Ошибка источника не создаёт completed run с частичным результатом.
- `get_report_run` возвращает созданный запуск и поддерживает серверную пагинацию строк.
- После рестарта потеря in-memory запусков явно задокументирована.
- `npm run check` и согласованные пороги покрытия проходят без живой сети.
- Ручная проверка подтверждает работу одного отчёта через настоящий `/mcp` endpoint.

## Риски и открытые решения

### Версия MCP SDK

Используется только стабильная v2-линия split packages. Точную версию нужно проверить в `MCP-01` по registry и release notes, затем закрепить в `package.json` и lockfile. Нельзя переносить v1-примеры с `@modelcontextprotocol/sdk` и ручным `StreamableHTTPServerTransport`.

### Интеграция HTTP

Официальный v2 handler использует web-standard `Request`/`Response` и создаёт свежий `McpServer` на запрос. При интеграции с Nest/Express нужно проверить фактический путь request body, отмены, Host/Origin validation и shutdown. Нельзя считать, что обычные Nest pipes, guards и interceptors автоматически применились к SDK handler.

### In-memory состояние

Singleton repository подходит только для одного процесса и учебного вертикального сценария. Он не даёт долговечности, общей истории между инстансами или защиты после аварии. Эти гарантии появляются только после Epic с PostgreSQL.

### Размер ответа

Даже при лимите 1500 наблюдений MCP result не должен бесконтрольно дублировать исходные данные в text и structured content. Таблица ограничивается, а полная выдача доступна страницами через `get_report_run`.

### Отмена и deadline

Закрытие HTTP-вызова должно отменять загрузку источника. Одновременно нельзя публиковать completed run после истечения deadline. Конкретное поведение современного Streamable HTTP transport проверяется интеграционным тестом, а не предполагается по API types.

## Учебный результат

После Epic автор должен уметь объяснить:

- зачем `SourceRegistry` отделяет application service от конкретного адаптера;
- чем структурная Zod-валидация отличается от семантической проверки по dataset schema;
- почему расчёты являются чистыми функциями, а orchestration — Nest provider;
- как `AbortSignal` проходит от HTTP transport до внешнего `fetch`;
- почему MCP handler — transport boundary, а не место бизнес-логики;
- чем временный in-memory repository отличается от будущего PostgreSQL persistence;
- как contract и e2e-тесты проверяют разные уровни системы.

## Официальная документация

- [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP SDK: serving over HTTP](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md)
- [MCP client connection](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md)
- [NestJS modules](https://docs.nestjs.com/modules)
- [NestJS custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
- [NestJS testing](https://docs.nestjs.com/fundamentals/testing)
- [Zod basics](https://zod.dev/basics)
