# MCP Reporter Backend

Учебный production-like backend для построения воспроизводимых отчётов и предоставления их AI-клиентам через MCP.

Архитектура и границы проекта описаны в [`mcp_reporting_design.md`](./mcp_reporting_design.md). Правила работы AI-агентов находятся в [`AGENTS.md`](./AGENTS.md).

## Требования

- Node.js 24.11.x;
- npm 11.6.x.

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

Реализован только минимальный NestJS-каркас. MCP, World Bank, PostgreSQL, Prisma и Docker будут добавляться отдельными учебными этапами.
