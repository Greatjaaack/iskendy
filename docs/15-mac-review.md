# Проверка и исправления Phase 0 на Mac — 2026-10-08

Рабочая копия: `/Users/maxgainullin/Projects/Iskendy-frontend`.
Исходный ZIP: 359304 байт; SHA256
`99a5eaad4be5cae98678ce06c71ae6a60be44c0021de3353d8dad75ab7d9acc1`.
Checkpoint: `ff57b2681a4e5f277a40dc9e3482ee171e27194a`.
Backend reference: `7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b`.

## Что изменено

- Исправлен ESLint после локальной установки браузеров: `.cache/`, `artifacts/`
  и отдельные интеграционные отчёты исключены. До исправления ESLint проверял
  JavaScript браузера и выдавал 50920 проблем вместо проверки проекта.
  Regression-тест подтверждает исключения и сохранение проверки собственного кода.
- Исправлена передача маршрута между legacy и новым приложением.
  Загрузчик следит за `pushState`, `replaceState` и `popstate`. При пересечении
  границы app/legacy перезагружает тот же URL; внутри каждого фронта навигация
  остаётся прежней. Это решает переход касса → гостевое табло и обратный переход
  кнопками браузера. Query, данные history и storage не переписываются.
- Добавлены браузерные сценарии для `/board`, `/board?my=1`, `/board?view=queue`,
  reload, ошибки загрузчика/явного повтора, history, синтетического входа кассы,
  опроса/офлайн-плашки и восстановления.
- Добавлен отдельный воспроизводимый localhost-спайк FastAPI/CSP.
  Он копирует backend во временную папку, использует синтетическую SQLite,
  Python 3.12 и версии из poetry.lock. Lifespan/фоновые задачи отключены,
  исходящий HTTP запрещён. Исходный backend checkout остаётся чистым.

## Результаты

- Полный `npm run verify`: **PASS**.
- Vitest: **218/218**, 16 файлов; строки 99.76%, ветви 97.12%.
- Mock E2E: **91/91**. Chromium: Android/390, tablet/768,
  desktop/1024, desktop/1440 и витрина. WebKit: iPhone/390.
- Отдельный FastAPI/CSP-спайк: **18/18** на Chromium/1440 и WebKit/390.
  Проверены все пять маршрутов, CSP/локальные картинки, отсутствие React mount
  и Метрики на операционных маршрутах, тестовая авторизация, реальные графики
  на синтетических данных, сессия после reload, `/sw.js`, переходы между фронтами.
- TypeScript, ESLint, токены, форматирование, сборка, бюджеты: **PASS**.
- `npm audit --omit=dev --audit-level=high`: **0 уязвимостей**.
- `package.json`, lockfile, legacy snapshot и `public/sw.js` не изменены.
- Релизный архив содержит index.html, legacy.html, sw.js, app/, assets/,
  VERSION, ROUTES.json; sourcemaps и MSW отсутствуют.

Логи и шесть screenshots: `review-evidence/mac-2026-10-08` (исторический локальный архив, см. [публикацию](52-publication-2026-10-16.md)).
HTML-отчёты: `playwright-report/index.html` и `playwright-report-spike/index.html`.
Screenshots — smoke legacy; это не визуальная приёмка нового дизайна.
Внешние legacy-шрифты/ресурсы в интеграционном тесте блокируются намеренно;
CSP проверена для загрузчика и своих ресурсов, без проверки Google Fonts.

## Статус gate и следующий этап

Автоматическая часть Phase 0 пройдена. ADR-003 остаётся «Требует проверки»:
физические iPhone/Android, реальная доставка уведомлений и ручная приёмка
не выполнялись. WebKit/эмуляция iPhone их не заменяет. Отдельная проверка в
Docker/progon.py и полный W5-5 также не выполнены.

По docs/09-roadmap.md фаза закрывается после критериев выхода и приёмки всех
задач; docs/14-review-handoff.md требует принятия Phase 0/ADR-003 до нового UI.
Владельцу нужно выбрать: сначала ручная приёмка на телефонах либо явно разрешить
параллельную работу над Phase 1, сохранив эти проверки обязательными перед выпуском.
Ни Phase 0, ни ADR-003 автоматически принятыми не объявлены.

После этого — W1-1 (Web/Icon 72:53, Brand/Logo, орнамент), затем W1-2
(Web/Button 67:44). Доступ к Figma на Mac подтверждён. Для Icon и Button получены живые
context+screenshot+variable defs; значения V4 сверены с приложенными токенами.
В Brand assets подтверждены Brand/Logo 66:1135 (53:2 on-light, 66:1124 on-dark)
и Brand/Rosette 53:13. Перед реализацией бренда нужны его context+screenshot
и проверка точного узла орнамента; SVG из текста не восстанавливаются.
2026-10-08 Максим разрешил продолжить разработку: Phase 1 начата параллельно
с открытой ручной приёмкой. Это не принятие Phase 0/ADR-003 и не разрешение выпуска.
67:79 — Web/Status; гостевая страница — 66:292. Экраны по тексту не строятся.

## Повторить локальную интеграционную проверку

В отдельном терминале с Python 3.12 и установленными версиями backend lock:

```sh
python scripts/local-backend-spike.py \
  --backend /tmp/iskendy-mac-backend-reference \
  --dist /Users/maxgainullin/Projects/Iskendy-frontend/dist --port 8099
```

В другом терминале из frontend:

```sh
npx playwright test --config playwright.spike.config.ts
```

Runner принимает только проверенный чистый backend commit, создаёт новую
временную БД и слушает 127.0.0.1. После Ctrl+C временная рабочая копия удаляется.
Зависимости и runtime этой проверки установлены в `/tmp/iskendy-mac-test-tools`;
системный Python не менялся. Никаких production API, push/deploy или GitHub repo.
