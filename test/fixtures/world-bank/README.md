# World Bank API fixtures

Минимальные неизменяемые ответы World Bank Indicators API для разработки и тестирования адаптера. Получены 8 октября 2026 года. В production-коде нельзя предполагать, что значения показателей или `lastupdated` останутся такими же.

## Источники

| Fixture | Запрос |
| --- | --- |
| `data-page-1.json` | `https://api.worldbank.org/v2/country/DEU/indicator/SP.POP.TOTL?source=2&date=2020%3A2021&format=json&per_page=1&page=1&footnote=y` |
| `data-page-2.json` | `https://api.worldbank.org/v2/country/DEU/indicator/SP.POP.TOTL?source=2&date=2020%3A2021&format=json&per_page=1&page=2&footnote=y` |
| `countries-country-and-aggregate.json` | `https://api.worldbank.org/v2/country/DEU%3BWLD?format=json&per_page=10` |
| `indicator-sp-pop-totl.json` | `https://api.worldbank.org/v2/indicator/SP.POP.TOTL?source=2&format=json` |
| `api-error-invalid-country.json` | `https://api.worldbank.org/v2/country/NOT_A_CODE?format=json` |

Во всех случаях сервер ответил HTTP 200. Поэтому адаптер обязан проверять не только HTTP status, но и форму JSON payload.

## Зафиксированные особенности контракта

- Ответ данных имеет форму tuple `[metadata, records]`.
- `metadata.page`, `pages` и `total` — числа.
- `metadata.per_page` в data endpoint является числом, а в проверенных country и indicator endpoints — строкой. Схема внешнего ответа должна учитывать оба варианта и нормализовать их после проверки.
- Наблюдения вернулись в порядке `2021`, затем `2020`; адаптер должен явно сортировать нормализованный результат по году.
- Год приходит строкой, числовое значение — числом или `null`.
- `unit`, `obs_status` и `footnote` могут быть пустыми строками.
- Metadata показателя содержит пустой `unit`; единицу и семантический тип нельзя надёжно выводить только из этого поля.
- Реальная страна `DEU` имеет обычный регион, а агрегат `WLD` — `region.value = "Aggregates"` и `region.id = "NA"`.
- Ошибка неизвестной страны возвращена с HTTP 200 и payload другой формы: `[{ "message": [...] }]`.

Документация: [World Bank API basic call structures](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures), [country queries](https://datahelpdesk.worldbank.org/knowledgebase/articles/898590-country-api-queries), [indicator queries](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries).

## Правила использования

- Автоматические тесты читают эти файлы локально и не обращаются к интернету.
- Fixtures изменяются только после осознанной проверки внешнего контракта.
- Для malformed JSON, timeout, network error и сбоя второй страницы будут отдельные синтетические fixtures или test doubles: получить такие сценарии как стабильный живой ответ невозможно.
- Live API используется отдельной opt-in проверкой и не является условием обычного `npm run check`.
