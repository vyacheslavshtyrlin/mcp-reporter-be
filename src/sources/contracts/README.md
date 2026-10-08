# Контракт источника данных

Контракт отделяет ядро отчётов от конкретных API. `DataSourceAdapter` не раскрывает URL, HTTP pagination или исходную форму World Bank JSON.

## Основные решения

- Интерфейс разделён на `DatasetCatalog`, `DatasetValuesCatalog` и `RecordSource`. Потребитель может зависеть только от нужной возможности; `DataSourceAdapter` объединяет их для регистрации полного адаптера.
- `DataFilter` — discriminated union по `operator`. Для `eq` значение скалярное, для `in` — массив.
- Записи динамические, но плоские: значение поля ограничено `string | number | boolean | null`.
- Успешный `RecordBatch` имеет литеральный `transportComplete: true`. Частичная загрузка должна завершаться `SourceError`, а не успешным batch с `false`.
- `DatasetSchema` объявляет роли полей, ключ наблюдения, temporal field, меры и разрешённые операции. Ядро не должно знать имена `countryCode`, `indicatorCode` и `value` заранее.
- `SourceError` отделяет стабильный машинный `code` от текста сообщения, сохраняет исходную ошибку в `cause` и содержит только структурированный безопасный context.
- TypeScript-интерфейсы существуют только во время проверки типов. `SourcesModule` экспортирует массив реализаций через runtime-токен `DATA_SOURCE_ADAPTERS`; потребители не зависят от конкретного `WorldBankAdapter`.

## Инварианты, которые позже проверяются runtime-валидацией

Типы не доказывают, что данные от внешнего API корректны. Реализация адаптера обязана отдельно проверить:

- положительную целую `schemaVersion`;
- существование полей фильтра и периода в schema;
- соответствие filter operator возможностям поля;
- `fromYear <= toYear`;
- непустые и уникальные `fields`;
- неотрицательные и согласованные coverage counts;
- уникальность records по `keyFields`;
- ISO timestamp в provenance;
- соответствие каждой записи объявленной dataset schema.

Документация: [TypeScript structural typing](https://www.typescriptlang.org/docs/handbook/type-compatibility), [discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), [NestJS custom providers](https://docs.nestjs.com/fundamentals/custom-providers).
