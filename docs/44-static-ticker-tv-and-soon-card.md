# Статичные Ticker, TV и карточка игры · 2026-10-09

Рабочая копия: `/Users/maxgainullin/Projects/Iskendy-frontend`, branch `feat/approved-multiorder-navigation`. Backend не изменён. Зависимости и lockfile не изменены; GSAP не установлен, motion не добавлен.

## Локальные примеры

Новый стабильный snapshot: `/tmp/iskendy-ticker-tv-preview-20261009-v2`.

- Обычный гость: http://127.0.0.1:5188/ — введите112 или102. В деталях заказа карточки «Сыграть — Скоро» / «Всё табло». Desktop footer содержит Ticker; на мобильном footer доступен в «Помощь».
- TV populated: http://127.0.0.1:5188/dev/tv.html?state=populated
- TV empty: http://127.0.0.1:5188/dev/tv.html?state=empty
- TV no-connection: http://127.0.0.1:5188/dev/tv.html?state=no-connection
- TV overflow: http://127.0.0.1:5188/dev/tv.html?state=overflow

5186 и5187 не перезаписаны и их storage не сброшен. Playwright использовал отдельные временные browser contexts. Production `/tv`, `/staff`, `/stats` остаются legacy. Новый TV entry существует только в development/отдельном mock build, production input его не включает. TV не подключён к API, polling, health reload, telemetry или storage; это контролируемый визуальный пример с синтетическими номерами.

## Авторские источники и поведение

Ticker228:21535: высота56, radius28, gap28, все пять сообщений и подпись «Мудрость дня:» дословно. Сохранены оригинальные четыре звезды18.6667 и сердце20. Одна последовательность без повторных screen-reader объявлений. Пока без GSAP: нативный horizontal scroll пальцем/трекпадом, клавиатурные Home/End/стрелки без animation. Полный текст остаётся доступен при любой ширине, overflow не растягивает страницу. Background взят из current vars surface/footer#f8f3e7, а не stale fallback MCP.

TV56:96: populated56:2, empty56:55, no-connection66:1151, overflow66:1192. Сохранены логотип/розетка и все тексты. Добавлены только недостающие шесть TV/* styles из текущего MCP; ранее существовавшие TV 768/* не изменены. Сцена1920×1080 равномерно вписывается в viewport1366×768; отдельного авторского1366 TV02 нет (страница51:35 относит1366 к TV01 меню). В no-connection сохранённые номера не показываются. Никакое число не исчезает по выдуманному expiry: вход сверх авторской capacity отклоняется до отображения, без truncation. Этот guard не подключён к production данным.

**Overflow не принят:** текущий визуальный пример точно повторяет размеры88/96 из66:1202 и сетку3×4, но описание56:96 требует нижний предел80%≈106. Владелец получил точный вопрос88 vs106; до ответа не выбирается новая геометрия. Последующая проверка контракта45: backend/legacy не удаляют активные ready по возрасту; полный серверный список сохраняется. Для >12 нужен только согласованный display policy без придуманного client expiry. N из описанияFigma не существующее серверное правило. Нельзя скрывать активные заказы по придуманному сроку. Q-29/Q-30 ниже.

Карточка игры184:213: narrow184:189 и wide204:21859, оригинальные petals90, vector34×60 и play22. Переиспользованная arrow20 побайтно совпала с новым экспортом (SHA в SOURCE.json). Авторский заголовок «Сыграть» сохранён. Владелец9октября разрешил только карточку с «Скоро», без игровой концепции: article без href, button, tabindex и click handler; подсказка про работающее pause заменена согласованным «Скоро». Иллюстрация и остальные стили сохранены. Это не исполняемая игра. Игровые исходники/engine/маршрут сейчас не требуются и не блокируют этот объём.

## Проверки и gate

- typecheck, lint, check:tokens, format:check PASS.
-645 unit /61 files, coverage thresholds PASS.
-481 полный E2E PASS: Chromium/WebKit component kit, iPhone/Android/tablet/1024/desktop; TV четыре состояния на1920/1366, Ticker keyboard, Soon card без navigation/writes, storage/API/rate-limit/runtime/legacy regression.
- Отдельный стабильный snapshot PASS в Chromium/WebKit:390/768/1024/1440, reload, all assets, четыре TV состояния, zero real API fallback/page errors. JSON и screenshots: `review-evidence/ticker-tv-2026-10-09/manual`.
- Docker synthetic real-origin PASS: HTTP contracts,4 rating +2 status flows,18 legacy/CSP; artifacts/real-backend-oFviIN, собственные container/image удалены, backend166f35d неизменён. Summary сохранён в evidence.
- Production build PASS. ALL JS144079 Б gzip /122880, превышение21199; CSS10663/30720. Прирост к предыдущему baseline143173 составляет906 Б. Checker/лимит/список чанков не ослаблены. Dev TV не входит в production JS.

Figma read-only context и vars: `review-evidence/ticker-tv-2026-10-09/source`. Источники SVG: `src/assets/ticker/SOURCE.json`, `src/assets/game-tile/SOURCE.json`. Физический Xiaomi/его UA не проверены. Phase0/ADR003, size gate и ручная приёмка остаются открытыми.

## Точные параметры для следующего motion этапа

1. Loader: opacity min/max и easing для breathing1.4с; rotation360°/1.1с linear уже известна. Разрешить противоречие reduce breathing vs zero motion; текущий static reduce сохранён.
2. Steps pulse: период, амплитуда, easing. Status change, button tap, chip selection, slider magnet, Dialog open/close: duration/easing и displacement/scale, если используются.
3. CompactDock, только если нужна плавность: длительность/дистанция/easing hide/reveal; текущие функциональные scroll/focus правила уже есть, кольцо убрано.
4. Popup: enter/exit duration, displacement/easing; конкретная cadence внутри45–60с (hold6с известен). Float: duration/easing/траектории (3–4 chips и30px известны). Для обоих author reduce=none.

Следующий независимый этап: измеряемое сокращение aggregate JS; motion — после конкретных авторских параметров и зафиксированных версий/бюджета. TV integration требует отдельно согласованного overflow/expiry и браузера устройства, а не изменений backend.

Продолжение: [45 · локальный bundle аудит и контракт TV](45-local-bundle-audit-and-tv-contract.md), [46 · конкретное GSAP предложение](46-gsap-motion-proposal.md).
