# Документация «Искенди · веб»

## Карта

| Документ                                     | О чём                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [01-product.md](01-product.md)               | Что за продукт, кто им пользуется, сценарии, жизненный цикл заказа, что в объёме и что нет        |
| [02-architecture.md](02-architecture.md)     | Стек, структура, маршруты, загрузчик, опрос, хранилище, уведомления, аналитика, сборка            |
| [03-api-contract.md](03-api-contract.md)     | Все эндпоинты, которые использует фронт: запросы, ответы, ошибки, лимиты, известные дефекты       |
| [04-design-system.md](04-design-system.md)   | Токены, цвета и их семантика, типографика, сетка, компоненты, иконки, фото, генерация токенов     |
| [05-figma-workflow.md](05-figma-workflow.md) | Figma MCP: подключение, карта узлов, цикл «макет → код → сверка», критерии совпадения             |
| [06-security.md](06-security.md)             | Модель угроз и правила безопасности                                                               |
| [07-testing.md](07-testing.md)               | Стратегия тестирования, обязательные сценарии, матрица устройств, бюджеты                         |
| [08-delivery.md](08-delivery.md)             | CI, релизы, состав архива, интеграция с основным репо, деплой, откат                              |
| [09-roadmap.md](09-roadmap.md)               | Фазы и задачи с критериями готовности                                                             |
| [10-decisions.md](10-decisions.md)           | Принятые решения (ADR) и открытые вопросы                                                         |
| [11-motion-gsap.md](11-motion-gsap.md)       | Фаза 7: микроанимации на GSAP. **До фазы 7 не реализовывать**                                     |
| [12-night-mode.md](12-night-mode.md)         | Ночной режим: облачный агент при выключенном компьютере, кэш Figma, очередь задач, шаблон задания |

## Порядок чтения

- **Codex перед первой задачей:** `AGENTS.md` → 01 → 02 → 03 → 04 → 05 → 07 → 10 → 12. Перед каждой задачей — её раздел в 09.
- **Claude Code:** `CLAUDE.md` → 02 → 06 → 07 → 08 → 10 → 12.

## Глоссарий

| Термин                 | Значение                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Дюрюм                  | Основной продукт «Искенди»: начинка в тонкой лепёшке. Не «шаурма» — ни в текстах, ни в коде                                               |
| Касса                  | POS-система точки (сейчас iiko, готовится переезд на СБИС Presto). Заказы с неё попадают на табло через аналитику; фронт об этом не знает |
| Табло                  | Список активных заказов: «Готовим» и «Готово». На телефоне — экран `view=queue`, в зале — `/tv`                                           |
| Подписка / «мой заказ» | Гость ввёл номер с чека, телефон следит за этим заказом. Запись `iskendi_my_order`                                                        |
| Claim / `claimToken`   | Закрепление номера за телефоном (`POST /api/guest/claim`). Без ключа оценку не примут                                                     |
| `editToken`            | Ключ правки отзыва из ответа `POST /api/feedback`                                                                                         |
| `guest`                | Случайная метка устройства (`iskendy_guest`). Не выводится из IP и User-Agent                                                             |
| `session`              | Метка визита (`iskendy_visit` в `sessionStorage`), живёт до закрытия вкладки                                                              |
| Воронка                | Шаги гостя, которые фронт пишет в `/api/guest/event`                                                                                      |
| Legacy                 | Старый фронтенд: один `index.html` без сборки. Хранится снимком в `legacy/`                                                               |
| Загрузчик              | Новый `index.html` + `src/boot/`: решает, какой фронт показать на этом пути (ADR-003)                                                     |
| V4                     | Действующая веб-палитра в Figma: режим «V4 · основной» коллекции Semantic                                                                 |
| Owner опроса           | Единственный компонент, который запрашивает `/api/status` по таймеру (ADR-004)                                                            |

- [24 · Ручной preview, JS budget и гостевой motion](24-manual-preview-and-js-budget-2026-10-08.md)

- [25 · Выданный заказ: карточка, история и напоминание на Mac](25-issued-card-2026-10-08.md) — 448 unit / 275 E2E, Docker и пары Figma; size gate открыт.

- [26 · Footer и гостевая композиция на Mac](26-footer-guest-composition-2026-10-08.md) — W1-8/W1-12, оригинальные SVG V4, 461 unit / 286 E2E; отдельный ручной v3.

- [27 · Интеграция ручных layout fixes](27-manual-layout-integration-2026-10-08.md) — поверх Footer, 461 unit / 310 E2E, отдельный объединённый manual v4.

- [34 · Диагноз bundle и возврат Oxc](34-bundle-diagnosis.md) — безопасные import-пробы, 486 unit / 328 E2E / 63 progon, стабильный claim regression; size открыт.

- [35 · Устойчивый интервал feedback check](35-feedback-check-clock.md) — регрессии системных часов и параллельных запросов, 489 unit / 328 E2E, Docker integration PASS; size открыт.

- [36 · Паритет гостевого flow с legacy](36-legacy-guest-parity.md) — 25 domain parity scenarios, исправление initial ready signal; 515 unit / 333 E2E и Docker integration PASS, runner полного progon.

- [37 · Startup, polling и telemetry](37-startup-polling-telemetry.md) — legacy/full-browser comparison, монотонный client-report cooldown; 533 unit / 383 E2E, Q-27/Q-28 и size остаются открыты.

- [38 · Multiorder: модель и безопасная миграция](38-multiorder-domain-migration.md)

- [39 · Multiorder: live claim и отдельные оценки](39-multiorder-live-bindings.md)

- [40 · Согласованная multiorder-навигация](40-approved-multiorder-navigation.md)

- [41 · Обычный guest preview и дополнительные ALL JS измерения](41-guest-preview-and-size-followup.md)

- [42 · Оценка без технической панели](42-linked-rating-preview.md)

- [43 · W7, игра и TV: фактический остаток](43-motion-and-missing-scope-audit.md)

- [44 · Статичные Ticker, TV и карточка игры Скоро](44-static-ticker-tv-and-soon-card.md)

- [45 · Локальный bundle аудит и контракт TV](45-local-bundle-audit-and-tv-contract.md)
- [46 · GSAP: конкретное предложение для одного согласования](46-gsap-motion-proposal.md)

- [48 · Responsive Liquid Glass и требования к бэкенду](48-responsive-liquid-glass-2026-10-15.md).
- [49 · Исторический снимок паузы](49-paused-frontend-2026-10-15.md).

- [50 · Передача адаптивного гостевого фронтенда на приёмку](50-responsive-frontend-handoff-2026-10-15.md).

- [Первый заказ и тестовый стенд для телефона · 16.10](51-first-order-and-phone-preview-2026-10-16.md)

- [52 · Подготовка публичного снимка](52-publication-2026-10-16.md) — состав, очистка, проверки и границы публикации.
