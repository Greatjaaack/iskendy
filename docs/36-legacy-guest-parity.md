# W5-1 · Паритет гостевого flow с legacy · 2026-10-09

Baseline: 7cc1652924b8603d0ca1b0afe3ba5804a170707e.
Ветка: test/w5-1-legacy-guest-parity. Только существующий singleton flow;
новые экраны, multiorder, storage/API контракты и зависимости не добавлены.

## Метод и воспроизводимость

25 тестов в tests/unit/legacy-guest-parity.test.mjs извлекают **неизменённые**
function declarations из legacy/index.html снимка 7ab20f0 через установленный
TypeScript parser и исполняют их в отдельном Node VM. Функции subSubmit/subTo,
claimEnsure, fbWatch/fbAskServed, myWatch, fbSendRating/fbSendDetail и storage/identity
работают с синтетическими ответами и изолированными Map-хранилищами.
Fetch заменён явным тестовым responder; реальная сеть отсутствует. UI, звуковые
каналы и telemetry — инертные sinks; это доменное сравнение, не запуск полного
legacy браузерного UI. Для нового приложения используются реальные subscription,
rating, order-machine и createOrderStorage; фиксированы часы и существующие ID.

Сравниваются порядок endpoint calls, GET/POST, number query, JSON payload и
распарсенный итоговый iskendi_my_order, включая неизвестные верхние/вложенные поля.
Порядок JSON object keys различается у served/already и не является изменением
контракта. Guest/visit/staff sentinel проверены побайтно, набор storage keys прежний.
Извлечение закрытого набора функций останавливается при изменении их состава.

## Совпадения и ранее согласованные отличия

| Сценарий                                  | Запросы и storage                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Номер на табло                            | Один claim; тот же number/guest, n/d/seen/subAt/claim/servedAt/rated/done/lastStatus                                                |
| not_found, not_served при отставшем board | check(number), затем claim; seen=false/true соответственно                                                                          |
| Уже выдан / уже оценён                    | Только check, без claim до оценки; одинаковый served/rated/done record                                                              |
| Claim taken / too_many / 429              | Один запрос; подписка не записывается, автоматического повтора нет                                                                  |
| Сетевой сбой claim                        | Один запрос; подписка с пустым claim, остальные поля совпадают                                                                      |
| Выдача: already / not_found / not_served  | Те же rated/gone/no-op patches; успешный check дополнительно сохраняет lastStatus=served в новом домене                             |
| Смена дня / забыть заказ                  | Order удаляется; guest/visit и staff sentinel остаются                                                                              |
| Откат выдачи                              | servedAt/promptedAt/gone сбрасываются; новый домен сразу записывает актуальный lastStatus                                           |
| Первая оценка                             | Новый flow добавляет fresh check, затем тот же create payload и fb record                                                           |
| Оценка без claim                          | Fresh check → тот же claimEnsure(number/guest) → create; ключ остаётся в исходном поле                                              |
| Смена эмоции существующего отзыва         | Только rate(feedback_id/edit_token/rating), без claim; новый storage сохраняет неизвестное вложенное поле fb, которое legacy теряет |
| Negative detail                           | Идентичный payload; detailSent после успеха, новый done=true обозначает завершение диалога                                          |
| Positive detail                           | Согласованный flow с tags only, без negative comment/contact; успешный ответ завершает диалог                                       |
| Ошибка detail                             | Legacy ошибочно ставит detailSent после любого HTTP ответа; новый flow оставляет явный повтор доступным                             |
| Сеть detail                               | В обоих случаях record не меняется и POST не повторяется автоматически                                                              |
| not_claimed при create                    | Legacy помечает неуспешную оценку rated; новый flow очищает невалидный claim, не изображает сохранённый отзыв                       |

Fresh check, acknowledgement-only completion, positive tags и retryable errors
уже реализованы и описаны в docs/23; совместимость неизвестных storage полей —
ADR-012. Это **не новые изменения** текущей задачи и не попытка перенести ошибки
legacy в новый код. lastStatus/done — существующие доменные различия, зафиксированные
здесь; новых полей или продуктовых решений не добавлено.
E13 требует повторного сигнала после отката выдачи: он сохранён, даже если
legacy myWatch в некоторых восстановленных записях оставлял lastStatus=ready.

## Подтверждённая регрессия и исправление

В первом ready snapshot с пустым lastStatus новый домен отправлял ready-сигнал,
а legacy myWatch сначала запоминал статус без сигнала. Это воспроизведено:
24/25 PASS, 1 FAIL на исходном коде (regression-before-ready.log).
Исправлен только ready effect: первое отображение готового заказа без предыдущего
статуса молчит. Preparing → ready по-прежнему сигналит один раз; E13 rollback
по-прежнему сигналит повторно. lastStatus=ready сохраняется до последующих тиков.

Добавлены проверка владельца эффекта и браузерный сценарий restore/reload
готового заказа без предыдущего статуса. Старый тест перехода теперь задаёт
lastStatus=preparing, а не маскирует initial snapshot под переход.

## Проверки

- typecheck/lint/tokens/format/coverage/build: PASS, **515 unit tests** (48 файлов).
- Целевые parity/order/effects: **87/87**, из них 25 сценариев паритета.
- Полная Chromium/WebKit матрица: **333/333 PASS** (5 новых device cases).
- Во время первого полного прогона: 331 PASS / 2 FAIL в стартовых WebKit
  подписках, ещё до claim. Тесты не ждали загруженного board и проверяли лишь
  наличие MSW hook. Теперь ждут видимый aria-busy=false у кухонной проекции
  перед вводом; assertions, retry count и таймауты не ослаблены.
  WebKit signals **18/18** при трёх повторах; затем полная матрица 333/333.
- Изолированная Docker integration: HTTP contracts, 4 rating + 2 status flows,
  18 legacy/CSP PASS. Свой контейнер и image tag удалены.
- ALL JS **137790 Б gzip > 122880 Б**, превышение **14910 Б**, FAIL.
  +10 Б относительно 7cc1652. verify остановился на size, E2E выполнен отдельно.
- SHA256 сохранённых preview 5180/5181/5182: 115/115/122 файлов неизменны.

Evidence: ../review-evidence/legacy-guest-parity-2026-10-09/.
Real summary фиксирует baseline HEAD 7cc1652 и dirty:true: browser integration
проверяла текущие изменения до локального коммита, включая готовое исправление.

Официальный неизменённый progon.py --analytics запускается **после сохранения
итогового коммита**, командой:

`node review-evidence/legacy-guest-parity-2026-10-09/run-progon.mjs`

Runner сохраняет frontend HEAD/чистоту и результат в artifacts/parity-progon-*/,
клонирует чистый pinned backend 166f35d, проверяет lock, использует свежую
синтетическую SQLite, Docker network none, readonly root, tmpfs, без host ports.
Аналитика — подставная внутри своего контейнера; уведомления выключены,
внешний HTTP запрещён. Удаляются только собственные UUID container/image tag.
Количество пройденных сценариев и SHA итогового HEAD берутся из progon.log и
summary.json этого отдельного прогона; не переносятся с предыдущего baseline.

## Оставшиеся пробелы

W5-1 не объявлен полностью принятым: этот блок сравнивает доменные API/storage,
а не весь исторический UI и его startup/poll/telemetry timing. Полная browser
матрица нового приложения и legacy bridge выполняются отдельно; native каналы
уведомлений, физические телефоны, Telegram/QR, VoiceOver/TalkBack не проверены.
Финальные визуальные композиции, продуктовые вопросы и ADR-003 остаются открыты.
W5-5: progon проверяет неизменённый backend с итоговым frontend archive, но сам
не доказывает JS flow; browser integration покрывает отдельный ограниченный набор.
Приёмка фаз не подменяется тестами. 100 гостей/production/load tests не запускались.
Оригинальные docs Projects/Iskendy, Figma, backend и сохранённые previews не менялись.
Нет новых dependencies, push или deploy.
