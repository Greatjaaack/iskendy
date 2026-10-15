# 02 · Архитектура

## 1. Ограничения, которые задаёт бэкенд (не обсуждаются)

| Ограничение | Следствие для фронта |
|---|---|
| FastAPI отдаёт `frontend/index.html` на `/`, `/board`, `/tv`, `/staff`, `/stats`; остальное — `StaticFiles` из `frontend/`, смонтированный на `/` | Собираем статику в папку, которая целиком кладётся во `frontend/`. Других путей у приложения нет, состояние — в query |
| CSP в `main.py`: `default-src 'self'`; `script-src 'self' 'unsafe-inline' https://mc.yandex.ru`; `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com`; `img-src 'self' data: https://mc.yandex.ru`; `connect-src 'self' https://mc.yandex.ru`; `frame-src https://mc.yandex.ru`; `worker-src 'self' blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'self'` | Только свой origin и Метрика. Нет `wasm-unsafe-eval` — никаких WASM-библиотек. Медиа (`media-src` не задан) — только со своего origin |
| Без отдельных заголовков кэша: `StaticFiles` отдаёт ETag и Last-Modified | Имена бандлов с хэшем. `index.html` ревалидируется браузером |
| Опрос, вебсокетов нет | TanStack Query с интервалом |
| Лимиты по IP; в зале все телефоны выходят через один IP | Экономим запросы, см. [03-api-contract.md](03-api-contract.md) §3 |
| `sw.js` — только уведомления, без `fetch` и кэша | Кэширующих service worker и PWA-плагинов нет |

## 2. Стек (ADR-001)

Версии — последние стабильные на момент старта фазы 0, зафиксированные в `package-lock.json`. Обновления — отдельными PR.

| Слой | Решение | Зачем |
|---|---|---|
| Язык | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` | Безопасность типов на границе с нетипизированным API |
| UI | React 19 | Экосистема владельца, Figma MCP, качество генерации кода |
| Сборка | Vite | Статика с хэшами, прокси `/api` в разработке |
| Роутинг | Свой модуль `src/app/router.tsx` (ADR-020) | Два пути + query, история браузера |
| Серверные данные | TanStack Query | Опрос, отмена, дедупликация, кэш |
| Валидация | Zod | Схемы каждого ответа: бэкенд отдаёт нетипизированные `dict` |
| Стили | CSS Modules + CSS-переменные из токенов Figma | Явные стили, чистые диффы, без рантайма |
| Доступные примитивы | Radix UI: `@radix-ui/react-dialog`, `@radix-ui/react-slider` | Фокус, Esc, `role="slider"` с `aria-*` без самописных ловушек |
| Картинки | vite-imagetools | AVIF/WebP/JPEG, `srcset` на этапе сборки |
| Шрифты | @fontsource: `rubik`, `onest`, `cormorant-garamond` | Свой origin, не зависим от Google в РФ |
| Тесты | Vitest, React Testing Library, MSW, Playwright | [07-testing.md](07-testing.md) |
| Качество | ESLint (`react-hooks`, `jsx-a11y`, `@typescript-eslint`), Prettier | Единые правила |
| Анимации (только фаза 7) | GSAP + `@gsap/react` | [11-motion-gsap.md](11-motion-gsap.md) |

## 3. Структура репозитория

```
├─ AGENTS.md · CLAUDE.md · README.md · CHANGELOG.md
├─ docs/
├─ .github/
│  ├─ workflows/ci.yml · release.yml
│  └─ pull_request_template.md
├─ legacy/                       снимок старого фронта, не редактировать
│  ├─ index.html                 → dist/legacy.html
│  ├─ assets/                    favicon.png · logo_white.png · iskendi_wordmark_white.png → dist/assets/
│  └─ SOURCE.md                  коммит основного репо, дата снимка
├─ public/
│  └─ sw.js                      контракт legacy: только уведомления, без кэша
├─ tokens/                       экспорт из Figma (коммитится)
│  ├─ figma-primitives.json
│  ├─ figma-semantic.json        режим «V4 · основной»
│  └─ figma-text-styles.json
├─ design/figma/                 кэш данных Figma MCP для облачных задач (снимает Claude Code)
├─ scripts/
│  ├─ figma-export-tokens.js     код для use_figma (только чтение)
│  ├─ build-tokens.mjs           JSON → src/styles/tokens.css, typography.css
│  ├─ check-tokens.mjs           запрет сырых цветов и примитивов
│  ├─ check-size.mjs             бюджеты размера
│  └─ assemble-release.mjs       dist → архив + sha256
├─ index.html                    точка входа загрузчика
├─ dev/kit.html                  витрина компонентов (только dev)
├─ src/
│  ├─ boot/                      routes.ts · legacy.ts · main.ts
│  ├─ app/                       App.tsx · router.tsx · providers.tsx · ScreenBoundary.tsx
│  ├─ config/                    features.ts (флаги) · env.ts
│  ├─ api/                       client.ts · errors.ts · schemas/*.ts · endpoints/*.ts
│  ├─ domain/
│  │  ├─ order/                  record.ts · machine.ts · effects.ts · subscribe.ts
│  │  └─ rating/                 emotions.ts · tags.ts · flow.ts
│  ├─ storage/                   storage.ts · keys.ts · schemas.ts
│  ├─ polling/                   BoardPoller.tsx · interval.ts · connectivity.ts
│  ├─ platform/                  notifications.ts · sound.ts · vibration.ts · analytics.ts · clientEvents.ts · visibility.ts
│  ├─ ui/                        по папке на компонент Figma: Button/ Input/ Status/ OrderTicket/ Steps/ …
│  ├─ screens/                   Entry/ Order/ Rating/ Board/ Help/ Offline/
│  ├─ content/                   по файлу на экран и компонент · contacts.ts · notifications.ts
│  ├─ assets/                    photos/ · icons/ · emotions/ · ornament/
│  └─ styles/                    tokens.css (генерируется) · typography.css (генерируется) · global.css
└─ tests/
   ├─ e2e/                       сценарии Playwright
   ├─ fixtures/                  реальные ответы бэкенда (JSON)
   └─ msw/                       обработчики
```

Компоненты в `src/ui/` называются как в Figma без префикса: `Web/OrderTicket` → `src/ui/OrderTicket/OrderTicket.tsx`. Пропсы повторяют свойства и варианты Figma: `status`, `size`, `variant`, `state`.

Общих файлов-реестров, которые правит каждая задача, нет. Иначе параллельные PR будут конфликтовать ([12-night-mode.md](12-night-mode.md) §5):
- витрина (`dev/kit.html`) находит компоненты сама через `import.meta.glob`;
- тексты лежат по файлу на экран или компонент.

## 4. Загрузчик и сосуществование с legacy (ADR-003)

Новый `index.html` подключает `src/boot/main.ts`. Тот смотрит на путь:

```ts
// src/boot/routes.ts — единственное место, где маршрут переключается между фронтами
export const ROUTES = {
  '/': 'app',
  '/board': 'app',
  '/tv': 'legacy',    // фаза 6
  '/staff': 'legacy', // фаза 8
  '/stats': 'legacy', // фаза 8
} as const;
```

- **`app`** — монтируется новое приложение.
- **`legacy`** — загрузчик получает `/legacy.html` (`fetch`, `cache: 'no-cache'`) и заменяет им документ (`document.open()` / `document.write()` / `document.close()`) **на том же URL**. Старый клиент выбирает экран по `location.pathname`, поэтому видит свой путь и открывает правильный экран.
- Модули приложения не должны иметь побочных эффектов при импорте: в legacy-режиме приложение не стартует вовсе.
- Неизвестный путь (в норме недостижим) — legacy.

**Статус ADR-003 — «предложено, требует проверки» (задача W0-7).** Спайк должен подтвердить в Chromium, WebKit и на реальных iPhone и Android:
- `/staff`, `/tv`, `/stats` в legacy-режиме работают как раньше: вход в кассу, опрос, плашка «нет связи», графики;
- Метрика не инициализируется на этих путях: legacy сам проверяет путь;
- `sw.js` регистрируется;
- в консоли нет ошибок CSP.

**Если спайк не прошёл:** выпуск только целиком, когда `/tv`, `/staff`, `/stats` перенесены на новый фронт. Откат — только на предыдущий архив. Решение фиксируется в ADR-003.

## 5. Маршрутизация

- Свой маршрутизатор `src/app/router.tsx` (ADR-020 вместо React Router): `useLocation`, `useNavigate({ replace })`, `<Link>` поверх `history.pushState` и `popstate`. Пути `/` и `/board`; один корневой компонент выбирает экран по query и состоянию заказа ([01-product.md](01-product.md) §5–6).
- Query разбирается Zod-схемой: `view ∈ {queue, help}`, `my ∈ {1}`. Неизвестные значения игнорируются.
- Переходы через хелперы `goEntry()`, `goOrder()`, `goQueue()`, `goHelp()`. Прямые `navigate('/…')` в экранах запрещены.
- `document.title` на каждый экран — из `src/content/`.
- При смене экрана фокус переводится на заголовок нового экрана (`tabIndex=-1`), прокрутка — наверх. Исключения описаны в правилах таб-бара.

## 6. Слой API

### 6.1 Клиент `src/api/client.ts`

```ts
type ApiError =
  | { kind: 'network' }                                    // fetch упал: нет сети, DNS, CORS
  | { kind: 'timeout' }                                    // наш таймаут
  | { kind: 'aborted' }                                    // отмена вызывающим (не ошибка для UI)
  | { kind: 'rate_limited'; detail?: string }              // HTTP 429
  | { kind: 'http'; status: number; detail?: string | ValidationIssue[] } // прочие не-2xx
  | { kind: 'schema'; issues: string[] };                  // 2xx, но ответ не прошёл Zod

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
```

- Все запросы — через `request(endpoint, schema, { signal, timeoutMs, body })`. В компонентах `fetch` не используется.
- **Таймаут** реализуется собственным `AbortController` + `setTimeout` и объединяется с внешним `signal` вручную. `AbortSignal.timeout` и `AbortSignal.any` не использовать: их нет в части целевых браузеров.
- Таймауты: опрос `/api/status` — 6 с; остальные чтения — 8 с; записи — 10 с.
- Ответ: сначала проверить `Content-Type` и аккуратно разобрать JSON. Прокси на 502/504 может вернуть HTML — это `http`, а не падение. Затем `schema.safeParse`.
- **Бизнес-ошибки** (`ok: false` + `reason` в теле при HTTP 200) — это **данные**, а не `ApiError`: они описаны в схеме эндпоинта как discriminated union по `ok`.
- `detail` у FastAPI — строка или массив (422). Разбирается в одном месте (`errors.ts`).
- Логи в консоль только в dev. Тела запросов с токенами не логировать никогда.

### 6.2 Схемы

Одна схема на ответ эндпоинта, рядом с эндпоинтом (`src/api/schemas/`). Общего «конверта» ответов нет. Схемы выводятся из реальных ответов: фикстуры снимает Claude Code с локального бэкенда, задача W0-5. Для объектов — `.passthrough()`: бэкенд может добавить поле, и это не должно ронять экран.

## 7. Серверное состояние (TanStack Query)

Настройки по умолчанию задаются явно:

| Параметр | Значение | Почему |
|---|---|---|
| `queries.retry` | `0` | Повтор опроса — это следующий тик; иначе счётчик сбоев врёт (ADR-004) |
| `queries.refetchOnWindowFocus` | `false` | Возврат во вкладку обрабатывает владелец опроса явно |
| `queries.refetchOnReconnect` | `true` | Связь вернулась — сразу обновить |
| `queries.refetchOnMount` | `false` | Монтирование потребителя не должно порождать запрос |
| `mutations.retry` | `0` | Повторы записей — только по таблице идемпотентности (§10) |

`/api/feedback/config` запрашивается один раз за визит: `staleTime: Infinity`, при ошибке — значения по умолчанию (`promptDelaySec: 180`, `links: {}`) и до 2 повторов с паузой 5 с. Это чтение без побочных эффектов.

## 8. Опрос табло (ADR-004)

- **Один владелец.** `<BoardPoller audience="guest" />` монтируется один раз в `providers.tsx`. Только он вызывает `useQuery({ queryKey: ['board'], queryFn, refetchInterval })`.
- **Потребители** читают кэш через `useBoard()`: `useQuery({ queryKey: ['board'], queryFn, enabled: false })`. Своих таймеров у них нет.
- **Интервал** вычисляет чистая функция `nextInterval({ visible, failures, audience })`:

  | Условие | Гость (`guest`), ТВ (`tv`) | Касса (`staff`, фаза 8) |
  |---|---|---|
  | Вкладка видима, сбоев нет | 5 с | 5 с |
  | Вкладка скрыта | 20 с (`refetchIntervalInBackground: true`) | 20 с |
  | Подряд неудачных опросов: 1 / 2 / 3 / 4 / 5+ | 5 / 10 / 20 / 40 / 60 с | 5 / 10 / 10 / 10 / 10 с |

- **Возврат во вкладку** (`visibilitychange` → `visible`): немедленный опрос, если запрос не идёт.
- **Без наложения:** запрос, который уже идёт, не отменяется и не дублируется (`cancelRefetch: false`). У каждого запроса свой `AbortSignal` и таймаут 6 с.
- **Счётчик связи** (`connectivity.ts`, `useSyncExternalStore`): `consecutiveFailures` (+1 на неудачу, 0 на успех), `lastSuccessAt`, `offlineSince`. Считаются только **завершённые** запросы; `aborted` не считается.
- **Отображение потери связи:**

  | Аудитория | Поведение |
  |---|---|
  | Касса (legacy, а с фазы 8 — новый фронт) | Плашка после 2 неудачных опросов подряд, без задержки |
  | Гость | Экран или плашка «Нет связи» по Q-01. По умолчанию — после 30 с без успешного опроса, считая от `lastSuccessAt` |
  | ТВ | Q-17 |

- **После восстановления связи:** если перерыв был больше 30 с, один отчёт `offline` с длительностью в `/api/client/event` (§11.5).

## 9. Хранилище (ADR-012, журнал заказов — ADR-019)

`src/storage/` — единственный код, который трогает `localStorage` и `sessionStorage`. Все операции в `try/catch`: приватный режим и запреты браузера не должны ронять экран.

| Ключ | Где | Содержимое | Правила |
|---|---|---|---|
| `iskendy_guest` | `localStorage` | Метка устройства, до 40 символов | Читать; если нет — создать в формате legacy: `String(Date.now() % 1e9) + Math.random().toString(36).slice(2, 10)` |
| `iskendi_my_order` | `localStorage` | Проекция выбранного заказа для отката на legacy ([01-product.md](01-product.md) §6.1) | Zod-схема с `.passthrough()`; запись — **патчем к актуальной версии** (как `fbPatchMy` в legacy), а не перезаписью устаревшей копией |
| `iskendy_orders_v1:<id>` | `localStorage` | Журнал заказов гостя: одна операция на ключ (`add`, `patch`, `remove`, `snapshot`) | ADR-019. Ключи не перезаписываются. Больше 20 ключей — сворачиваются в один `snapshot` со списком поглощённых ключей (запись другой вкладки в этот момент сохраняется, недоудалённые ключи не применяются повторно). Хранится один деловой день по `date` из `/api/status`. Разбор кэшируется до изменения набора ключей |
| `iskendy_selected_order_v1` | `sessionStorage` | Открытая карточка этой вкладки `{ n, d }` | ADR-019, SEC-02: номер заказа не попадает в адрес |
| `iskendy_visit` | `sessionStorage` | Метка визита | Формат — как в legacy |
| `iskendy_staff_token` | `localStorage` | JWT кассы | **Не трогать** до фазы 8 |

- Синхронизация вкладок: слушать событие `storage` по журналу и `iskendi_my_order`, чтобы две вкладки не расходились.
- Совместимость в обе стороны проверяется тестом: запись legacy читается новым кодом, запись нового кода читается функциями legacy (в тесте они воспроизведены).

## 10. Записи и повторы

| Запрос | Идемпотентен? | Политика повторов |
|---|---|---|
| `POST /api/guest/claim` | Да, для того же `guest`: сервер вернёт тот же `claimToken` (`db.claim_order`) | Только по действию гостя. Один автоповтор после `timeout` или `network`. Нет повтора на 429 и `ok:false`. `claimEnsure` перед оценкой — тоже один вызов |
| `POST /api/feedback` | Нет: второй вызов вернёт `already` | Без автоповтора. После таймаута проверить через `GET /api/feedback/check`: `already` значит оценка записалась |
| `POST /api/feedback/rate` | Да, по смыслу: та же оценка → `changed: false` | Без автоповтора. Повтор только по действию гостя |
| `POST /api/feedback/detail` | Да, по смыслу: повторная отправка перезапишет те же поля | Без автоповтора. Кнопка блокируется на время запроса **и** есть защита от повторного вызова в логике (флаг «в полёте») |
| `POST /api/guest/event` | Да (дедупликация на клиенте) | Без повторов, `keepalive: true`, ошибки молча игнорируются |
| `POST /api/client/event` | — | Без повторов, троттлинг 60 с (§11.5) |

## 11. Платформа

1. **Уведомления** (`notifications.ts`):
   - поддержка определяется по наличию `Notification` и `serviceWorker`;
   - разрешение спрашивается только сразу после подписки, по действию гостя;
   - `navigator.serviceWorker.register('/sw.js')`, затем `registration.showNotification(...)`; запасной путь — `new Notification`;
   - `tag: "iskendy-order"`, `renotify: true`;
   - ошибки молча игнорируются: звук и экран уже сработали.
2. **Звук** (`sound.ts`): короткий сигнал через WebAudio, как `chime()` в legacy. `AudioContext` создаётся и разблокируется на первом `pointerdown`, `keydown` или `touchstart` и при нажатии «Показать статус».
3. **Вибрация** (`vibration.ts`): `navigator.vibrate` при наличии. Подписка — 30 мс, «Готово» — паттерн из legacy.
4. **Метрика** (`analytics.ts`):
   - загрузчик тега Метрики переносится из legacy в модуль, без инлайновых скриптов;
   - инициализация только на `/` и `/board`, параметры `clickmap`, `trackLinks`, `accurateTrackBounce`, `webvisor` — как в legacy;
   - `hit` при смене экрана, без дублей подряд;
   - `reachGoal` — имена из [01-product.md](01-product.md) §13;
   - если Метрика не загрузилась (блокировщик), вызовы молча ничего не делают.
5. **Отчёты экрана** (`clientEvents.ts`): `POST /api/client/event {kind, screen, detail}`.
   - `kind`: `offline` (после восстановления, с длительностью), `render` (ErrorBoundary), `js` (`error` и `unhandledrejection`).
   - `detail` — не длиннее 300 символов, без токенов, номеров чужих заказов, контактов и комментариев.
   - **Не чаще раза в 60 с с устройства** (в legacy было 30 с). Причина — дефект BUG-01: этот лимит делит корзину с подпиской на заказ ([03-api-contract.md](03-api-contract.md) §4).
   - Никогда не отправлять во время сценария подписки.

## 12. Ошибки и деградация

- `ErrorBoundary` на корне и на каждом экране. Упавший экран показывает аккуратное состояние с действием «Обновить», без технических деталей, и отправляет отчёт `render`.
- Ошибка отрисовки не маскируется под обрыв сети: сеть и рендер обрабатываются раздельно (как в legacy).
- Гость при любой ошибке видит, что делать дальше. Тексты — из Figma; если их нет, это открытый вопрос.

## 13. Стили и раскладка

- `src/styles/tokens.css` и `typography.css` **генерируются** из `tokens/*.json` ([04-design-system.md](04-design-system.md) §9). Руками не редактируются.
- `global.css`: сброс, `@font-face` из @fontsource, фон `--iskendi-bg-canvas`, базовый текст `--iskendi-fg-primary`.
- Компоненты — CSS Modules. Специфичность не выше одного класса; состояния через `data-*` (`data-state="pressed"`, `data-status="ready"`), а не через цепочки классов.
- Mobile-first. Брейкпоинты:
  - `< 768` — мобильный каркас: `Web/Header/Mobile` + `Web/Dock`;
  - `≥ 768` — каркас планшета и десктопа: `Web/Header/Desktop` + `Web/NavSwitch`;
  - `≥ 1024` и `1440` — по фреймам T1024 и D*.

  Порог 768 или 1024 — Q-04.
- Контент десктопа — 1200 px, 12 колонок, промежуток 48 px.
- Отступы и радиусы — только переменные `--space-*` и `--radius-*`.
- Уважать `env(safe-area-inset-*)`: док не должен заезжать под системную полосу iPhone.

## 14. Изображения, иконки, шрифты

- **Фото и персонажи.** Исходники — в `src/assets/`, импорт через vite-imagetools: `?w=…&format=avif;webp;jpg&as=picture`. Компонент `<Picture>` рисует `<picture>` с `srcset`/`sizes`, явными `width`/`height` и `decoding="async"`.
  - Главное изображение первого экрана — `loading="eager"` и `fetchpriority="high"`.
  - Остальные — `loading="lazy"`.
  - Персонажи эмоций — статичный WebP 180 и 720 px (по описанию `Web/EmotionCharacter`: размеры `sm` 72 и `lg` 240 при плотности ×3).
  - Файлы из `public/` плагин не обрабатывает, поэтому фото туда не класть.
- **Иконки.** SVG из библиотеки `icons` в Figma (Regular / Solid) скачиваются через MCP в `src/assets/icons/` без изменений. Свой глиф только у VK.
  - Отрисовка — компонент `<Icon name>` через CSS `mask-image` (+ `-webkit-mask-image`) с `background-color: currentColor`. Так цвет задаётся токеном, а исходный файл остаётся нетронутым.
  - Декоративные иконки — `aria-hidden="true"`.
- **Орнамент** (шашка из розетки и фески) и логотип — из страницы «02 · Brand assets», как SVG-файлы. Логотип рисуется только своими цветами `--brand-logo-*`.
- **Шрифты.** Нужны начертания:
  - Rubik 700 и 900;
  - Onest 400 и 700;
  - Cormorant Garamond 600 italic.

  Подмножества `cyrillic` и `latin`, `font-display: swap`. Предзагрузка (`<link rel="preload">`) — только Onest 400 cyrillic и Rubik 700 cyrillic. Запасные стеки: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; для акцентного — `Georgia, serif`.

## 15. Сборка

```ts
// vite.config.ts — существенное
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'app',   // не пересекается со старой папкой assets/ legacy
    sourcemap: false,   // карты исходников наружу не публикуем
    target: BUILD_TARGET, // см. §16
  },
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
```

После `vite build` скрипт `assemble-release.mjs` собирает `dist/`:
- `legacy/index.html` → `legacy.html`;
- `legacy/assets/*` → `assets/`;
- `public/sw.js` → `sw.js` (копирует сам Vite).

Состав архива — [08-delivery.md](08-delivery.md) §3.

## 16. Поддержка браузеров

- **Гость:** актуальные iOS Safari (целевой минимум — iOS 15), Chrome и Android WebView (целевой минимум — Chrome 100), Samsung Internet, встроенные браузеры Telegram и сканеров QR. `build.target` подбирается под этот минимум и подтверждается e2e в WebKit и Chromium.
- **ТВ:** версия браузера неизвестна (Q-02). До ответа `/tv` остаётся на legacy. Если браузер старый, target и `@vitejs/plugin-legacy` (новая зависимость, через ADR) решаются в фазе 6.

## 17. Бюджеты производительности

| Метрика | Бюджет | Как проверяем |
|---|---|---|
| JS для `/` и `/board` до первого экрана: входной скрипт из `index.html`, чанк `mount-*` и их статические импорты | ≤ 120 КБ gzip | `check:size` |
| Ленивые чанки вместе (оценка, анимации) | ≤ 70 КБ gzip (решение 12.10, CODE-01) | `check:size` |
| CSS | ≤ 30 КБ gzip | `check:size` |
| Главное фото первого экрана | ≤ 150 КБ (AVIF) | `check:size` |
| Шрифты для первого экрана | ≤ 2 файла предзагрузки | Ревью |
| LCP на среднем Android по 4G | ≤ 2,5 с | Ручная проверка DevTools перед релизом |
| CLS | < 0,1 | Playwright + DevTools |

## 18. Фиче-флаги

`src/config/features.ts` — константы времени сборки, без удалённой конфигурации. Каждый флаг привязан к открытому вопросу и удаляется после ответа.

| Флаг | По умолчанию | Вопрос |
|---|---|---|
| `queueOnPhone` | `true` (как в Figma) | Q-14 — **блокирует релиз**, нужен явный ответ |
| `guestOfflineAfterMs` | `30000` | Q-01 |
| `contactConsent` | `false` | Q-07 |
| `rateBlockBeforeDelay` | `true` (как в Figma) | Q-19 |
| `telegramBot`, `offerCard`, `gameTile` | `false` | Вне объёма |
