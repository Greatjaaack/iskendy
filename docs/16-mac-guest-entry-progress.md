# Mac · Phase 2 · первый гостевой экран

Дата: 2026-10-08. Изолированная рабочая копия `/Users/maxgainullin/Projects/Iskendy-frontend`.
Параллельная разработка разрешена владельцем. Это не принятие ADR-003 или разрешение на выпуск.

## Реализовано

- Mobile Entry из Figma `68:2`: Header, hero, поле номера, явная подписка, сводка очереди, Dock.
- Общий BrowserRouter/QueryClient и единственный BoardPoller; остальные экраны читают кэш.
- API-adapter остаётся `src/api/endpoints/guest.ts`, только относительные пути. План Saby не считается контрактом.
- Ошибки `taken` / `too_many` и 429 сохраняют ввод; автоматического повтора 429 нет.
- Подписка вызывает POST только после нажатия, сохраняет прежний формат `iskendi_my_order`, открывает `/board?my=1`.
- Первые проекции OrderTicket и Mobile Board (`74:236`), восстановление после reload, выделение своего номера и переход обратно через Dock.
- Заголовок и фокус меняются при навигации. Шапка не переполняется на 320/360/390; 768/1024/1440 также без горизонтального скролла.
- Оригинальные локальные SVG дока: native 24/26/43×86/86×86; без анимации.
- Backend допускает номера 1…100000, поэтому Entry передаёт Input maxLength=6; базовые Figma-variants Input остаются maxLength=3.
- После подключения runtime-схем JS превысил 120 KiB. Использован `zod/mini` той же установленной версии (официальный subpath, без изменений package/lock). Типы, границы чисел и passthrough сохранены; все captured fixtures и проверки storage прошли.

## Проверено

- typecheck, lint, check:tokens, build, check:size — проходят.
- 289 unit tests, 146 Playwright tests (Chromium/WebKit, пять размеров гостя).
- 18 integration tests под реальным FastAPI CSP в собственной Docker-копии с синтетической SQLite.
- JS всех чанков: 105.89 KiB gzip; CSS: 6.31 KiB gzip; два preload шрифта.
- Backend reference `7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b` остался чистым.
- Доказательства: `review-evidence/phase2-2026-10-08/`.

## Остаётся

- Desktop Entry: форма и Header работают, иллюстрация и Footer не завершены — Q-24 требует разрешения на семантические aliases либо исправления bindings в Figma.
- Help ещё технический placeholder; остальные Order-сценарии, сигнал, разрешение уведомлений, выдача/рейтинг и события воронки требуют следующих задач roadmap.
- Полный W2-1/W2-2 и фаза 2 не приняты; первые Order/Board — промежуточные проекции.
- Проверки реальных iPhone/Android и ревью Claude остаются release gate.
- Production API, нагрузочные испытания, backend, push и deployment не использовались.

## Preview

`http://127.0.0.1:5174/dev/kit.html` проверен HTTP 200 и открыт в браузере Codex на Mac.
`http://127.0.0.1:5173/` — development mock preview с синтетическими MSW-fixtures, не рабочая касса.
Оба localhost доступны на Mac, не с облачного компьютера.

