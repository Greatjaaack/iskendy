# Объединение ручных исправлений layout · 2026-10-08

Рабочая копия `/Users/maxgainullin/Projects/Iskendy-frontend`, ветка
`fix/integrate-manual-layout-20261008`. Исходная ветка была чистой:
`ef7ce4b` (Footer) поверх `e30d8bc` (issued-card). Патч из диагностического
потока — `6e213a9d7bb2ff864797f3f886c60297457c40ce`, база ровно `e30d8bc`.
Сравнение затронутых Button/Dock/RatingDialog между этой базой и Footer HEAD
показало отсутствие пересечений. Выполнен cherry-pick в новую ветку, без
checkout/reset исходной базы и без конфликтов: **`bfac85d`**. Footer, ButtonLink,
issued-card, storage, API flow и route-focus fix сохранены.

## Исправления и проверка

Кольцо Dock 86×86 сохраняет полный внутренний слот; внешняя обводка 5 px
сделана box-shadow, как stroke outside в Figma. Primary Button растягивает
label в свободном слоте, оставляя knob 40×40 справа с отступом 6 px. Вариант
без knob имеет симметричный padding, в том числе при focus. У программно
сфокусированного h2 RatingDialog убран лишний outline; интерактивные поля/
кнопки сохраняют синий keyboard focus. Исходные SVG не менялись.

Затронутые компоненты (включая Footer/issued-card): **39 component tests PASS**.
Целевая браузерная матрица Button/Dock/RatingDialog/Footer/issued-card:
**50/50 PASS**, включая Chromium/WebKit, кольца всех трёх статусов на 320/390,
Rating R1–R3 на 320/390/768/1024/1440 и сохранение keyboard focus.
После этого выполнена полная регрессия объединённого кода:

| Проверка | Результат |
|---|---|
| typecheck / lint / format:check / tokens | PASS |
| Unit/component | **461 PASS**, 43 файла |
| Полная E2E матрица Chromium/WebKit | **310 PASS** |
| Production build / assembly | PASS |
| Отдельный manual v4 headless | Chromium + WebKit PASS |
| Size checker, без изменения правила | **FAIL: 139628 bytes = 136.36 KiB > 120 KiB** |

Evidence — `review-evidence/layout-integration-2026-10-08/`: логи,
узкие 320 px PNG обеих платформ, bundle report, manual results и manifests.
Первый обязательный bootstrap+mount graph — **115631 bytes = 112.92 KiB**;
ALL gate включает также отложенный Rating. Это не LCP и не приёмка бюджета.
`npm run verify` остаётся не зелёным; API/Docker проверка нового блока не
заявляется (проверена UI регрессия, backend не менялся).

## Пользовательские стенды и новый кандидат

До и после работы сверены все записанные bytes/SHA256 файлов:

- 5180: `/tmp/iskendy-manual-preview-20261008-v2`;
- 5181: `/Users/maxgainullin/Documents/Codex/2026-10-08/task-2/layout-preview`.

Оба снимка **неизменны**; их серверы и GUI не трогали.
Новый объединённый кандидат собран отдельно:
**`/tmp/iskendy-manual-preview-20261008-v4-unified`**, source `bfac85d`.
Он содержит Footer + issued-card + layout fixes, проверен headless на временном
localhost 5182 с выключенным API proxy. После проверки собственный сервер 5182
остановлен. V4 ещё не подменял пользовательские 5180/5181; готов к переключению
родительским потоком после окончания ручной проверки. Новый снимок не влияет
на ранее сохранённый v3-footer.

Roadmap остаётся **24/53 технически завершено, 17 частично, 12 не начато**.
Исправления не считаются новыми завершёнными пунктами. W1-9 остаётся частичным:
все 12 вариантов Dock и «Новое» ещё не приняты. W1-13 AssistCard/Tile — следующий
независимый блок. Push/deploy, production API и изменение admin scope не выполнялись.
