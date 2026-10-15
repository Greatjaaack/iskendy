# Footer и гостевая композиция · Mac · 2026-10-08

Рабочая копия `/Users/maxgainullin/Projects/Iskendy-frontend`, ветка
`feat/w1-footer-guest-composition`, база `e30d8bc`. Backend, legacy, исходная
документация, admin HTML проект/5191 и пользовательский GUI не изменялись.
Push/deploy не выполнялись.

## Выполнено

W1-8: `Web/Footer/Mobile` 90:109 и `Web/Footer/Desktop` 79:1512 **без Web/Ticker**,
как указано в roadmap. Mobile Footer расположен только в «Помощи», desktop —
на гостевых экранах, с подвалом внизу короткой страницы. Разметка «Помощи»
получила точный заголовок из M7 184:18014 вместо foundation-заглушки.
Полная Help-композиция пока требует AssistCard.

W1-12: четыре варианта `Web/InfoCard` 204:223 и три `Web/SocialButton` 204:233.
Address/contact/telegram — native HTTPS-ссылки из `config`; часы — статичная
карточка. Без безопасного адреса соцсеть и контакт управляющего скрыты;
адрес и часы остаются читаемыми, без фиктивного перехода. Q06 применён:
contact использует `links.telegram`. Юрстрока Instagram воспроизведена точно,
включая пробелы. Адрес/часы — default Q09, подтверждение для релиза открыто.
Ссылки имеют доступные имена, `noopener noreferrer`, клавиатурный фокус,
цели 48×48 или полную карточку 72 px. Фоновые claim/feedback POST не добавлены.
Новых зависимостей, API или storage keys нет.

Семь минимальных semantic aliases для chip/social заливок добавлены по ранее
согласованному **Q24**, с точными значениями `color/v4/*` и sourceNode.
Примитивы в компонентах не используются, палитра не подменяется.

## Исходные SVG и визуальная сверка

High-fidelity context, screenshots и variable definitions прочитаны для обоих
Footer, InfoCard и SocialButton. Прямые asset URL из get_design_context оказались
со старой V3 палитрой: `#203E52` / `#526B77`, тогда как текущий скриншот и
resolved variables требуют `#43342B` / `#6B574A`. Их не перекрашивали вручную.
Выполнен read-only `node.exportAsync({format:'SVG_STRING'})` именно для дочерних
экземпляров Footer/Mobile в текущем V4 mode. Изменённых узлов Figma: **0**.
Получены неизменённые pin/clock/chat/plane/VK/Instagram 24×24 и arrow 22×22.
Root geometry сохранена; provenance, размеры и SHA256 —
`src/assets/footer/SOURCE.json`. Chat V4 отличается от прежнего dock glyph;
это не точный дубль. Logo переиспользует уже проверенный `Brand/Logo`, слот 300 px.

В `review-evidence/footer-2026-10-08/` сохранены полные Figma PNG и Chromium/
WebKit PNG реализации. Mobile: **342×372**, desktop: **1200×188** — точно
соответствуют Figma Footer после исключения верхнего Ticker и одного gap:
342×440 − (56+12), 1200×268 − (56+24). Визуально совпадают карточки, glyphs,
цвета, отступы и бренд. Растеризация текста зависит от браузера; прозрачный
фон component screenshot Figma показан на сером canvas, в приложении — на
гостевом cream background. На 768 px карточки переносятся, чтобы текст часов
не выходил за фиксированную высоту; full T768 frame не объявляется принятым.

Точные четыре звезды из Ticker instance также скачаны штатным read-only flow:
`src/assets/ticker/SOURCE.json`, root 18.6667×18.6667. Они сохранены для W7,
не импортируются Footer и не анимируются. Это определённый исходник Ticker,
**не подтверждение** неизвестного отдельного орнамента W1-1. W1-1 остаётся
частичным; Rosette не назначена заменой.

## Регрессия и gate

Новая полная проверка выявила гонку начального фокуса WebKit: input мог получить
фокус между первым commit и passive effect, затем эффект переводил фокус на
h1 до `insertText`. Trace показывал пустое поле после fill. Route focus/title
перенесены в `useLayoutEffect`, выполняющий короткую операцию до paint.
Целевой повторный прогон **46/46** и затем полный **286/286** прошли; не было
увеличения таймаутов или скрытия ошибок повторными тестовыми попытками.

| Проверка | Результат |
|---|---|
| typecheck / lint / format:check / tokens | PASS |
| Unit/component | **461 PASS**, 43 файла |
| Полная Chromium/WebKit E2E матрица | **286 PASS** |
| Production build / assembly | PASS |
| Новый immutable manual snapshot headless | Chromium + WebKit PASS |
| Работающий v2 snapshot | Все записанные bytes/SHA256 неизменны |
| ALL JS gzip gate | **FAIL: 139604 bytes = 136.33 KiB > 120 KiB** |

Первый обязательный bootstrap+mount graph: **115608 bytes = 112.90 KiB**;
Rating отложен (23996 bytes). Это диагностический отчёт, не LCP и не обещание
для всех восстановленных состояний. `check:size` и лимит не изменены.
`npm run verify` поэтому не зелёный. Контрактные Docker-проверки предыдущего
checkpoint описаны в docs/25; новый Footer не объявляется отдельно испытанным
на Docker backend. Production API и нагрузочные тесты не использовались.

## Ручной снимок и точная готовность

Готов отдельный снимок:
**`/tmp/iskendy-manual-preview-20261008-v3-footer`**.
В нём issued-card + Footer, новый чек-лист. Он проверен headless на временном
localhost 5182, сервер после проверки остановлен. SHA256 manifest сохранён.
Пользователю v3 ещё не подменяли: **5180 остаётся на v2**. GUI не перехватывался.
После окончания пользовательской проверки родитель может переключить owned
5180 server на этот каталог через `scripts/manual-preview.mjs --serve`.

Roadmap/53: **24 сделано технически / 17 частично / 12 не начато** (45.3 % пунктов,
не трудозатрат). Добавлены W1-8 и W1-12; W4-2 теперь частичен (Help heading/Footer,
без AssistCard и полного frame). W2-1/W2-5 и прочие полные композиции остаются
частичными до завершения элементов и приёмки. Формальная приёмка фаз и release
gate не закрыты. Следующий независимый блок — W1-13 AssistCard/Tile по Figma;
бот/подарок/игра остаются за существующими отключёнными флагами.
