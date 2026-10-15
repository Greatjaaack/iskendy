# ADR-017 · Безопасное сравнение минификаторов · 2026-10-08

Максим разрешил ограниченный обратимый эксперимент с Terser после конкретного
вопроса о зависимости, рисках и сохранении 120 КиБ. Подтверждение передано
родительским агентом в 15:13 UTC. Основание процедуры — AGENTS.md §3, правило 5
и ADR-017 в docs/10. Baseline **4d9dafc** сохранён в истории, предыдущие evidence
не перезаписаны. Отправка приватного кода внешним сервисам не выполнялась.

## Фактическое сравнение

Установлен точно `terser@5.51.2` из `https://registry.npmjs.org`, только dev.
Vite использует его встроенный поддерживаемый путь `build.minify: 'terser'`.
Пакет один, Vite deduped к нему. `npm audit`: 0 уязвимостей. Транзитивные
build-зависимости записаны в lockfile; остальные версии не обновлялись.

| Вариант | ALL JS gzip | Время build в памяти |
|---|---:|---:|
| Oxc baseline | 137772 Б | 391 мс |
| Стандартный Terser | 139148 Б | 1404 мс |
| Terser ES2020, 1 проход | 139147 Б | 1699 мс |
| Terser ES2020, 2 прохода | 137500 Б | 2067 мс |
| **Terser ES2020, 3 прохода** | **137148 Б** | **2544 мс** |
| Terser ES2020, 5 проходов | 137148 Б | 3006 мс |
| Terser ES2020, 10 проходов | 137148 Б | 3143 мс |

Время — одиночные последовательные локальные замеры, не строгий performance
benchmark. Первый вариант Terser хуже baseline; безопасные дополнительные
проходы дали небольшой выигрыш. Пять/десять не улучшают ALL дальше.

Итоговая кандидатная конфигурация: ES2020, 3 прохода, `unsafe: false`, property
mangling выключен. Safari15/Chrome100 target сохранён. Нет `pure_funcs`, новых
side-effect допущений или drop-console. Radix build boundary из baseline
сохраняется. Все компоненты и features остаются полными; API/UX/storage/claim
и lazy Rating не менялись. Terser не входит в клиентские runtime dependencies.

| Метрика | Oxc baseline | Terser итог | Экономия |
|---|---:|---:|---:|
| ALL JS | 137772 Б | 137148 Б | 624 Б (0.45%) |
| Обязательный граф первого экрана | 115622 Б | 115297 Б | 325 Б |
| Deferred Rating | 22150 Б | 21851 Б | 299 Б |

По сравнению с исходным db71c8b (139626 Б) общий выигрыш обеих оптимизаций
2478 Б. Checker и порог 122880 Б **не изменены**. Итог 133.93 КиБ, превышение
**14268 Б**: `check:size` и полный `verify` остаются **FAIL**. Малый выигрыш
не является прохождением gate и не оправдывает обещание достижения 120 КиБ.

## Проверки финального состояния

- typecheck, lint, tokens, 483 unit/component tests (47 файлов), coverage,
  production build, format: **PASS**.
- `npm run verify`: вышеуказанные стадии PASS, останавливается на неизменённом
  size gate. Полный E2E запущен отдельно.
- Отдельный полный Chromium/WebKit E2E: **328/328 PASS**.
- `npm run test:e2e:real`: **PASS**, HTTP contracts + 4 rating + 2 status flows
  + 18 legacy/CSP tests. Backend reference `166f35d` неизменён и чистый;
  runner создал и удалил только собственные контейнер/image tag/context.
- Официальный неизменённый `scripts/progon.py --analytics`: **63/63 PASS**,
  в отдельном собственном Docker-контейнере с финальным Terser dist. Нет
  внешней сети или портов (`--network none`), readonly root, синтетическая БД
  и backup в tmpfs, подставная аналитика на собственном loopback. Harness
  прежний проверенный `review-evidence/js-size-2026-10-08/local-progon-spike.py`,
  TZ=Europe/Moscow. Первый запуск до health получил connection refused;
  после подтверждения health прогон выполнен целиком. Backend не исправлялся.
- Audit новых build dependencies: **0 vulnerabilities**.
- Preview 5180–5182: прежние SHA256 всех 115/115/122 файлов. Нет GUI действий.

NOT RUN: физические телефоны, native VoiceOver/TalkBack, production API,
load test 100 гостей. Формальная приёмка фаз остаётся 0/6.

Evidence: `review-evidence/terser-comparison-2026-10-08/`. Там воспроизводимые
скрипты сравнения с `build.write:false`, ALL/initial/chunk measurements,
аудит, очищенные полные журналы проверок и SHA256 preview. Карты исходников
не создавались и не поставлялись. Push/deploy отсутствуют.

Следующая задача — поиск более крупного сокращения в существующем стеке;
сохранённые замеры не показывают способ убрать оставшиеся 14268 Б. Этот ADR
не разрешает дополнительные библиотеки, смену React/Router/Query/Zod/Radix,
изменение checker, урезание возможностей или перенос нового multiorder UX.
