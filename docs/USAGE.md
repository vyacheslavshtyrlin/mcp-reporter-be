# Использование MCP Reporter Backend

Сервис предоставляет MCP Streamable HTTP endpoint `/mcp`. Взаимодействовать с ним нужно через MCP-клиент: прямой `GET` или одиночный JSON-запрос не заменяет MCP handshake и transport lifecycle.

## Локальный запуск

```bash
npm ci
cp .env.example .env
npm run start:dev
```

PowerShell-вариант копирования конфигурации:

```powershell
Copy-Item .env.example .env
```

Значения по умолчанию:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
```

После старта MCP URL — `http://127.0.0.1:3000/mcp`. Healthcheck доступен по `GET http://127.0.0.1:3000/health`.

## Рекомендуемый workflow

1. Вызвать `list_datasets` с `sourceId: "world-bank"`.
2. Вызвать `describe_dataset` для dataset `2` и использовать возвращённую `schemaVersion`.
3. Найти страны через `list_dimension_values` с полем `countryCode`.
4. Выбрать показатели через `list_measures`.
5. Передать определение в `run_report`.
6. Если `nextCursor` не равен `null`, читать следующие страницы через `get_report_run`.

Порядок важен: каталог является runtime-контрактом. Клиенту не следует угадывать идентификаторы полей, показателей или версию схемы.

## Примеры аргументов tools

Список dataset:

```json
{
  "sourceId": "world-bank",
  "limit": 20
}
```

Поиск стран:

```json
{
  "sourceId": "world-bank",
  "datasetId": "2",
  "field": "countryCode",
  "query": "Germany",
  "limit": 20
}
```

Отчёт по населению Германии и Франции за 2020–2023 годы:

```json
{
  "definition": {
    "sourceId": "world-bank",
    "datasetId": "2",
    "schemaVersion": 1,
    "kind": "time_series",
    "filters": [
      {
        "field": "countryCode",
        "operator": "in",
        "value": ["DEU", "FRA"]
      }
    ],
    "groupBy": ["countryCode"],
    "measures": [{ "id": "SP.POP.TOTL" }],
    "period": {
      "field": "year",
      "fromYear": 2020,
      "toYear": 2023
    },
    "missingPolicy": "strict_endpoints",
    "sort": {
      "field": "year",
      "direction": "asc"
    }
  },
  "limit": 20
}
```

Для изменения между началом и концом периода достаточно использовать то же определение с `kind: "period_change"`. Backend берёт значения строго за `fromYear` и `toYear`: отсутствующая точка не заменяется ближайшим годом.

## Формат результата

Каждый tool возвращает структурированный результат одного из двух видов:

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
    };
```

Для отчёта `data` содержит:

- `run` — идентификатор, определение, статус и metadata результата либо безопасную ошибку;
- `rows` — текущую страницу строк `time_series` или `period_change`;
- `nextCursor` — непрозрачный cursor следующей страницы либо `null`.

Metadata завершённого отчёта включает coverage, warnings, provenance источника и признак полной транспортной загрузки. `runId` живёт только в памяти текущего процесса.

## Ограничения и безопасность

- Максимальный размер страницы MCP-ответа — 100 строк; значение по умолчанию — 20.
- Общий deadline выполнения отчёта — 30 секунд.
- Сервис не возвращает completed-результат, если загрузка хотя бы одной страницы источника завершилась ошибкой.
- `null` от источника сохраняется как отсутствие значения и не превращается в ноль.
- `/mcp` пока не защищён аутентификацией. Оставляйте `HOST=127.0.0.1` и не публикуйте endpoint во внешнюю сеть.
- Автоматические тесты используют fixtures. Доступность и актуальная форма live World Bank API проверяются отдельно.

Полный контракт определения отчёта и правила расчётов описаны в [`EPIC-002.md`](../EPIC-002.md), а архитектурные ограничения — в [`mcp_reporting_design.md`](../mcp_reporting_design.md).
