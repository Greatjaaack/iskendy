# W5-1 · Startup, polling и telemetry · 2026-10-09

Baseline: 10284e39211394fa8b44759e815a3c11989ca1c1.
Ветка test/w5-1-startup-polling-telemetry. Ограниченный независимый блок,
без нового UX, изменения storage/API, backend, Figma или зависимостей.

## Что и как сравнено

12 runtime tests исполняют точные неизменённые legacy declarations и оригинальный
visibility listener в Node VM с синтетическим fetch и виртуальными часами.
Выполненные тесты реального BoardPoller/Query/API проверяют 6 s abort, таймеры,
completed failure count, сохранение cache, cleanup и отсутствие клиентского overlap.
Passive consumers не создают свой опрос. Это клиентская проверка, не нагрузка.

10 новых browser scenarios на каждом из пяти guest device projects (50 cases)
сравнивают полный неизменённый legacy HTML с production-сборкой текущего приложения.
В этих тестах каждый API перехвачен, сторонние origins заблокированы,
service workers отключены для изоляции transport, GUI не используется.
Visibility задаётся синтетическим browser event/property, часы — Playwright Clock;
это не физическое сворачивание приложения на iOS/Android.

| Проверка           | Наблюдение                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /board startup     | В обоих: 1 GET status, 1 GET config, 1 POST board_open; без claim. Exact event payload step/session/guest/number=null совпадает                                                                 |
| / startup          | Legacy landing не опрашивает API. Новый согласованный default entry начинает status/config/board_open. Это существующий вариант Q-03, не изменение этого блока                                  |
| Visibility         | В обоих: 5 s visible, 20 s hidden, один немедленный refresh при возврате; config/board_open не повторяются внутри страницы                                                                      |
| Slow status        | Legacy держит 4 одновременных запроса за 15 s. Новый query owner не запускает второй до завершения/abort предыдущего; повторные visibility events не отменяют текущий fetch                     |
| Новый transport    | Фактический GET /api/status, no-store, same-origin credentials; abort через 6000 ms; без внутреннего retry, следующий запрос по интервалу                                                       |
| Backoff/recovery   | Выполненная лестница 5/10/20/40/60 s, сохранение предыдущего cache и возврат к 5 s; 1 recovery callback. Unmount отменяет pending и прекращает таймеры                                          |
| Guest funnel       | Exact POST payload и keepalive=true совпадают. sub_try/sub_fail при каждой попытке; остальные шаги дедуплицированы в текущем загруженном экземпляре. Ошибки без retry; токенов в payload нет    |
| Analytics startup  | Счётчик 110894396 и исходные init flags совпадают. Legacy первый pageview неявный из init; новый defer:true + 1 manual hit. SDK блокируется, проверяется очередь вызовов, не доставка в Метрику |
| Client reports     | Текущий ADR-015: 60 s вместо legacy 30 s, тишина при активной подписке, generated detail и semantic screen вместо raw exception/path. Эти существующие отличия не отменены                      |
| Recovery в browser | После 3 failures и восстановления: 1 offline report с queue screen/40 s, guest visit step не дублируется; нормальный следующий poll без нового report                                           |

## Доказанное нарушение и узкое исправление

Системные часы меняли частоту client/event: +1 час обходил 60 s интервал,
−1 час задерживал следующий отчёт сверх 60 s. На исходном коде **2 FAIL / 8 PASS**.
Изменён только default elapsed clock createClientReporter: performance.now()
вместо Date.now. Инъекция test clock сохранена. Payload, generated detail,
подписочный quiet interval и политика без retry прежние; даты/storage не меняются.

Unit и реальные production browser default reporters проверены при переводе
часов вперёд и назад: до 59999 ms нового отчёта нет, после 60000 ms он разрешён.
Raw synthetic error message с тестовым token/contact текстом не попадает в payload.
Исправление относится к одному загруженному экземпляру, не вводит shared budget.

## Вопросы вместо продуктовых изменений

- **Q-27:** Legacy и новый frontend при F5 с тем же guest/visit снова отправляют
  board_open/config и начинают новый client-report budget. Это подтверждено в
  обоих полных browser documents и unit. Требуется определить, действует ли
  «раз за визит»/«60 с с устройства» сквозь reload и вкладки. Никакого нового
  storage ключа, общего бюджета или долговременной дедупликации не добавлено.
  Read-only backend 166f35d log_guest_event хранит повторные rows, а guest_funnel
  считает DISTINCT session как visits: визиты не следует путать с events.
- **Q-28:** Legacy запускает outage duration со второго failure и докладывает
  после восстановления даже короткого обрыва. Новый store считает от последнего
  success (или первого failure без success), BoardPoller докладывает лишь при
  duration >30000 ms. Зафиксированы границы 10000/30000/30001 ms и отличия
  reference point; порог и смысл duration не выбирались самостоятельно.

Вопросы внесены в docs/10-decisions.md. Q-01 (offline UI) и Q-03 (root entry)
остаются исходными вопросами, их решение не подменяется этим сравнением.

## Проверки

- Typecheck/lint/tokens/format/coverage/build PASS, **533 unit tests**, 49 файлов.
- Полная browser матрица **383/383 PASS**, включая 50 новых runtime cases.
- ALL JS **137783 Б gzip**, лимит 122880 Б; превышение **14903 Б — FAIL**.
  Относительно 10284e3 −7 Б; это не закрытие budget. verify остановился на size,
  browser suite выполнена отдельно. Checker/лимит/стек не изменены.
- Evidence: ../review-evidence/startup-polling-telemetry-2026-10-09/.
  После сохранения коммита целевые runtime unit/browser проверки повторяются
  с зафиксированным чистым HEAD в artifacts/runtime-final-*/; результаты final
  commit не подменяются проверками baseline.

NOT RUN в этом блоке: production API, 100 гостей/нагрузка, physical devices,
VoiceOver/TalkBack, native background lifecycle, реальный analytics SDK,
повтор полного Docker progon/test:e2e:real.
Client/event transport сохраняет прежнее различие: legacy keepalive=true,
новый endpoint keepalive=false; доставка при закрытии/смене страницы не проверена. Предыдущие 63/63 progon относятся
к 10284e3 и не заявляются как новый результат. Формальная приёмка W5-1,
ADR-003 и фаз остаётся открытой; Q-27/Q-28 и size требуют решения/работы.

Получено новое указание владельца о его свежих гостевых макетах и multiorder:
новый UX ждёт актуального handoff с node IDs. Свежий git diff перед сохранением
содержал только собственные runtime/tests/questions изменения; авторских
изменений или конфликтов в этой рабочей копии не обнаружено. Компоненты,
экраны и старые альтернативы не переносились. Нет push/deploy.
