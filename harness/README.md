# Verification harness

Harness предоставляет единый воспроизводимый interface для минимальных quality gates. Он не хранит статус работы и не заменяет критерии конкретной Task или Feature.

## Команды

```bash
npm run verify -- task
npm run verify -- feature
npm run verify -- epic
npm run verify -- epic --dry-run
npm run docs:check
```

| Scope | Проверки |
| --- | --- |
| `task` | Markdown links, format, lint, typecheck, unit tests, build |
| `feature` | Markdown links, format, lint, typecheck, coverage, build |
| `epic` | Markdown links, format, lint, typecheck, coverage, e2e, build |

Harness останавливается на первой ошибке и возвращает её exit code. `--dry-run` печатает план без запуска проверок.

`docs:check` проверяет inline- и reference-style ссылки на файлы и каталоги внутри репозитория. Внешние URL, anchors и примеры внутри fenced code blocks не проверяются; путь за пределами репозитория считается ошибкой.

Это минимальные общие gates. В Task plan дополнительно указываются проверки, необходимые конкретному изменению: integration-тесты, миграции, Docker healthcheck, opt-in live check или ручной сценарий. Такие проверки добавляются в общий harness только вместе с Feature, которая делает их воспроизводимыми.

## Evidence

Готовность подтверждается фактически выполненной командой и её результатом. Dry-run, намерение запустить проверку и результат предыдущей версии кода не считаются evidence.
