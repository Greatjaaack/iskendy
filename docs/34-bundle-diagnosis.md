# Диагноз ALL JS и возврат Oxc · 2026-10-09

Продолжение после отключения Mac: HEAD до сохранения `be93bf3`, ветка
`perf/reduce-production-js`. Незакоммиченные package/lock/Vite действительно
совпадали с Oxc baseline `4d9dafc`; дерево не сбрасывалось. Сборка перед
отключением успела завершиться, evidence сохранены. История Terser эксперимента
и docs/33 остаются; постоянная смена минификатора не принята.

## Итог

Oxc возвращён вместе с package/lock baseline, Terser больше не зависимость
текущего проекта. Сохранён точечный проверенный Radix tree-shaking из docs/32.
ALL JS: **137772 Б gzip**, лимит 122880 Б, превышение **14892 Б** — FAIL.
Обязательный граф первого экрана 115622 Б не подменяет ALL gate.

Стоимость Terser в зафиксированном одиночном сравнении: 2544 мс против
391 мс Oxc, **+2153 мс (~6.5×)**, за 624 Б экономии (0.45%). Это build в памяти,
не статистический performance benchmark. Повтор baseline/default давал
283/1384 мс и те же размеры; default Terser вообще тяжелее Oxc. Выигрыш малого
safe-minifier эксперимента недостаточен для постоянной дополнительной
зависимости; обратный коммит сохраняет сам эксперимент без изменения истории.

## Что реально занимает код

Source maps построены **только в памяти**, `build.write:false`. В итоговую
сборку maps не входят. Таблица — UTF-8 spans уже минифицированного кода по
source-map mappings; это не gzip-атрибуция. Сжатие изолированных spans нельзя
суммировать или вычитать из общего gzip и выдавать за достижимую экономию.

| Группа | Минифицированные mapped bytes |
|---|---:|
| React DOM | 207013 |
| Приложение, контент и assets bindings | 65504 |
| React Router | 35764 |
| TanStack Query Core | 33877 |
| Zod Mini/core | 24216 |
| Radix Slider | 9186 |
| React | 8214 |
| react-remove-scroll | 5665 |
| Radix Dismissable Layer | 5230 |
| Radix Dialog | 4705 |
| Radix Focus Scope | 4222 |

Крупнейший единичный модуль — production `react-dom-client` (203008 mapped
bytes). Приложение уже импортирует только публичный `createRoot` из
`react-dom/client`. Этот entry использует CJS production renderer, включая
внутреннюю hydration/event инфраструктуру и экспорт hydrateRoot. Публичного
альтернативного client-only entry в exports этой установленной версии нет.
Не включены development renderer, серверный React DOM renderer, MSW,
компонентные stories, unit-тесты или dev kit.

`QueryClient` действительно содержит MutationCache/Mutation (1560/3685 mapped
bytes), хотя приложение не использует useMutation. Это не случайный barrel:
конструктор всегда создаёт mutation cache, а mount/resume пути ссылаются на него.
Удаление методов или подмена класса означали бы изменение библиотеки,
не исправление импорта.

Router-файлы с `ssr` в имени содержат клиентские prefetched link helpers:
Link вызывает usePrefetchBehavior и PrefetchPageLinks. Они не являются случайно
включённым отдельным SSR renderer. Переписывание Link/Router либо вырезание
этих веток не считается безопасной import-only оптимизацией.

Zod Mini уже применяется. Full Zod classic/locales/compile/json-schema code
не присутствуют в emitted sources. Оставшиеся checks/object/union/parse/error
helpers нужны существующим API и storage schemas. Упрощение validation или
замена discriminated unions меняет диагностику ошибок и здесь не выполнялось.

У Radix Collection renderedLength до финальной минификации 10631 Б, но реально
осталось **1199 mapped bytes**. Называть 10.6 КБ полностью ненужным весом было бы
ошибкой; оставшаяся legacy collection нужна Slider. Focus/scroll/aria helpers
не удалялись ради размера.

## Измеренные безопасные import-пробы

Преобразования только в памяти, runtime/application source не изменены.

| Проба | ALL gzip | Результат |
|---|---:|---|
| Oxc baseline | 137772 Б | Контроль |
| Namespace Zod → public named imports | 137772 Б | Все hash/чанки побайтово те же |
| Namespace Dialog/Slider → public named imports | 137772 Б | Все hash/чанки побайтово те же |
| QueryClient напрямую из публичного Query Core entry | 137772 Б | Все hash/чанки побайтово те же |
| Отключение code splitting (только диагностический предел) | 143083 Б | +5311 Б, не кандидат |

Модулей с положительным renderedLength, помещённых в несколько чанков: **0**.
Эта проверка касается точных module IDs; не является универсальным доказательством
отсутствия похожих алгоритмов внутри разных библиотек. Namespace imports уже
tree-shake корректно; изменения ради вида не внесены. Новый lazy splitting не
выдаётся за уменьшение total. Single-chunk проба не применялась: тяжелее total,
другой first-screen cost и порядок module initialization.

## Выбор дальнейшего направления

| Вариант | Что подтверждено | Решение/риск |
|---|---|---|
| Оставить текущий стек/Oxc и искать локальные улучшения | Импортные пробы 0 Б, дубли чанков 0, оставшийся gap 14892 Б | Разрешено, но конкретного safe изменения, закрывающего gap, не найдено |
| Вернуть Terser | −624 Б и +2153 мс в замере, gate всё равно FAIL | Отклонено для постоянной конфигурации; experiment сохранён |
| Специализировать/патчить React DOM, QueryClient или Router | В этих частях крупный вес; безопасная достижимая gzip-экономия не измерена | Меняет библиотеку/утверждённый стек и требует решения/ADR, не выполнялось |
| Сменить renderer/cache/router/validator | Возможный крупный источник экономии, точного замера нет | Новый стек и риск контрактов/доступности, не выполнять без согласования |
| Изменить budget/checker либо считать только initial | Не является сокращением ALL | Не выполняется и не предлагается как исправление gate |

Диагноз не доказывает невозможность любого дальнейшего сокращения, но
проверенные безопасные варианты не дают оставшиеся ~14.5 КиБ. Размер не
объявлен PASS, scope не расширен молча.

## Проверки и границы

2026-10-09: typecheck/lint/tokens/format/coverage/build PASS, **486 unit tests**
(47 файлов) PASS. `verify` остановился только на неизменённом size gate.
Отдельная полная Chromium/WebKit матрица: **328/328 PASS**.
Синтетическая Docker integration: HTTP contracts, 4 rating + 2 status flows
и 18 legacy/CSP PASS. Официальный неизменённый `progon.py --analytics`:
**63/63 PASS** на новой синтетической БД, network none, без host ports,
readonly root, tmpfs, подставная аналитика внутри собственного контейнера.
Собственные контейнеры/image tags удалены; backend reference чистый.

Во время первого полного браузерного прогона снова воспроизвёлся существующий
flaky тест repeated submission: 327/328, секунды задержки claim не хватало,
чтобы WebKit успел проверить disabled. Сделана независимая правка только
**test tooling**, без изменений в приложении: MSW hold/release response gate
для точно разрешённых endpoint paths. Тест удерживает response до проверки
кнопки и двух Enter, затем проверяет единственный request и разрешение уведомлений.
У WebKit/MSW до ответа считается start marker handler, после ответа — также
browser request. Ожидания не ослаблены; retries/таймауты не повышены.

Добавлены три unit проверки: удержание сохраняет response и не блокирует
другие endpoints; reset выпускает pending request; неизвестные/prototype/
query paths и duplicate holds отвергаются. Fixture bytes/provenance прежние.
**10/10 WebKit iPhone повторов PASS** (4 workers), затем 328/328 full PASS.
Mock модуль целиком исключён из production; ALL JS и все три production
chunk filenames остались идентичны baseline 4d9dafc.

SHA256 всех 115/115/122 файлов preview 5180–5182 неизменны.
NOT RUN: physical devices, native VoiceOver/TalkBack, production API,
нагрузка 100 гостей. Формальная приёмка фаз 0/6, size остаётся FAIL.
Backend/Figma/API/UX/storage/claim/multiorder и preview 5180–5182 не менялись.
Админка и новые Figma экраны не приняты и в этой задаче не реализуются.
Нет новых зависимостей, GUI взаимодействий, push/deploy.

Evidence: `review-evidence/bundle-diagnosis-2026-10-08/`; название сохраняет дату
первичных замеров. Диагностические scripts используют существующие Vite и
trace-mapping; не сохраняют карты исходников на диск и не отправляют код наружу.
