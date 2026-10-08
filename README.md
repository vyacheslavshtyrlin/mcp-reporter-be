# MCP Reporter Backend

Учебный production-like backend для построения воспроизводимых отчётов и предоставления их AI-клиентам через MCP.

Архитектура и границы проекта описаны в [`mcp_reporting_design.md`](./mcp_reporting_design.md), текущий backlog — в [`TASKS.md`](./TASKS.md). Правила работы AI-агентов находятся в [`AGENTS.md`](./AGENTS.md).

## Требования

- Node.js 24.21.x;
- npm 11.19.x.

## Запуск

```bash
npm ci
copy .env.example .env
npm run start:dev
```

После запуска техническая проверка доступна по адресу `http://127.0.0.1:3000/health`.

## Проверки

```bash
npm run check
npm run test:cov
```

`npm run check` последовательно проверяет форматирование, lint, типы, unit-тесты, e2e-тесты и production build.

## Текущий этап

Завершён Epic интеграции World Bank: HTTP-клиент, runtime-валидация, полная пагинация, проверка целостности, повторы временных ошибок, каталог World Development Indicators и `WorldBankAdapter`. `SourcesModule` экспортирует registry адаптеров через runtime DI-токен. MCP, PostgreSQL, Prisma и Docker будут добавляться отдельными учебными этапами.
