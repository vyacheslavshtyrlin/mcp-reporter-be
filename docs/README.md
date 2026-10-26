# Документация MCP Reporter Backend

Этот каталог — навигационная точка документации. Главная страница и быстрый старт находятся в корневом [`README.md`](../README.md), а канонические проектные документы сохранены в корне репозитория, чтобы не ломать существующие ссылки и инструкции.

## Пользователю сервиса

- [`README.md`](../README.md) — назначение сервиса, возможности, запуск и текущее состояние.
- [`USAGE.md`](./USAGE.md) — подключение MCP-клиента, рекомендуемый порядок вызова tools и пример отчёта.

## Разработчику

- [`mcp_reporting_design.md`](../mcp_reporting_design.md) — основной источник требований, архитектуры и границ MVP.
- [`TASKS.md`](../TASKS.md) — актуальный backlog со статусами Epic, Feature и Task.
- [`EPIC-002.md`](../EPIC-002.md) — план, контракты и критерии приёмки завершённого MCP Epic.
- [`EPIC-003.md`](../EPIC-003.md) — согласованные границы, задачи и критерии приёмки текущего PostgreSQL Epic.
- [`POST_MVP_ROADMAP.md`](../POST_MVP_ROADMAP.md) — гипотезы развития после MVP; это не согласованный backlog.
- [`AGENTS.md`](../AGENTS.md) — правила разработки, обучения, тестирования и обязательного review.
- [`process/AGENT_WORKFLOW.md`](./process/AGENT_WORKFLOW.md) — роли агентов, состояния Feature, approval gates и контракты делегации.
- [`process/templates/`](./process/templates/) — шаблоны требований, технического дизайна, декомпозиции и review; они не являются отдельным backlog.
- [`../harness/README.md`](../harness/README.md) — единый interface проверок Task, Feature и Epic.

## Контракты и тестовые данные

- [`src/sources/contracts/README.md`](../src/sources/contracts/README.md) — правила общего контракта источников и доверительные границы.
- [`test/fixtures/world-bank/README.md`](../test/fixtures/world-bank/README.md) — происхождение fixtures и наблюдаемые особенности World Bank API.

## Где смотреть статус

Единственный файловый источник текущего статуса — [`TASKS.md`](../TASKS.md). Design doc объясняет целевое устройство, но сам по себе не означает, что функция уже реализована. Для проверки фактического поведения нужно также смотреть код и автоматические тесты.
