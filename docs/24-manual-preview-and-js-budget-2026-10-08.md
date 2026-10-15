# Стабильная ручная проверка и JS · 2026-10-08

Рабочая копия: `/Users/maxgainullin/Projects/Iskendy-frontend`, ветка
`perf/rating-js-budget`, исходный checkpoint `68c598b`.

## Ручной доступ на Mac

Открыт и проверен в браузере Mac:
**http://127.0.0.1:5180/dev/manual.html**.
Витрина: http://127.0.0.1:5180/dev/kit.html.
Матрица и шаги: http://127.0.0.1:5180/manual-checklist.html.

Снимок лежит отдельно в `/tmp/iskendy-manual-preview-20261008-v2`.
Это уже собранные файлы, без HMR: текущие изменения исходников его не меняют.
Окончательный снимок содержит исправленный binding `fetch` в recovery.
Сценарий потери JS-модуля не входит в панель ручного стенда: он отдельно
проверен на production-сборке в Chromium/WebKit и Docker/CSP.
Панель, моки, synthetic tokens и fixtures доступны только в явном mode=mock.
Production их не содержит. API proxy у preview отключён (`proxy: {}`):
неперехваченный API не отправляется существующему localhost backend.

Стенд повторно запускается без пересборки:

```sh
node scripts/manual-preview.mjs --serve /tmp/iskendy-manual-preview-20261008-v2
```

Для другого нового снимка передайте новый каталог. Скрипт отказывается
перезаписывать каталог с `SNAPSHOT.txt`. Порт 5180 закреплён, `strictPort=true`.
Содержимое снимка/хеши записаны в evidence; `/tmp` может быть очищен ОС.

| Можно тестировать сейчас | Не готово / ограничение |
|---|---|
| Ввод номера, preparing/ready, табло, issued-проекция, gone, новый день | Полная композиция, Help, issued-card/обычный trigger/напоминание W2-5 |
| Статичные эмоции 1–5, Slider и R1–R4 в витрине | Fixtures API покрывают 5/positive и 1/negative; не все серверные сочетания 1–5 |
| Positive R1→R2→R4; negative R2→R3→R4, ошибка detail и повтор | Contact/Telegram/coupon/game отключены; production данные не используются |
| Claim 429, задержка 10 s, offline после 30 s; Escape, Back, черновик | Реальные разрешения notification, телефоны/VoiceOver и нагрузка — отдельные проверки |
| 320/390/768/1024/1440, клавиатура, фокус | Ширина iframe не эмулирует настоящий телефон; GSAP ещё не реализован |

Сценарий «Положительная ветка»: выберите 5, «Дальше», «Вкус», «Дальше».
Отрицательная ветка начинается с уже созданной синтетической оценки 1:
причины, комментарий, отправка. Ошибка detail: после отказа нажмите внешнюю
кнопку «Убрать ошибку отправки» и повторите отправку в интерфейсе.
Подписка 429/медленная сеть: введите 999. «Начать заново» восстанавливает
только order этого изолированного origin, не затрагивая рабочий проект.
«Открыть оценку снова» возвращает диалог без сброса draft после закрытия.
Ссылки Maps — fixture `example.test`, не реальные ссылки организации.

Репродукция manual QA:
`PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright node review-evidence/perf-rating-2026-10-08/manual-preview-check.mjs`.
Оба браузера прошли entry/preparing/ready/issued partial/positive/negative,
ошибку и повтор detail, новый день, ширину 320 и витрину эмоций 1–5.
Скриншоты и JSON лежат рядом.

## Оптимизация

Рейтинг, Radix Dialog/Slider и связанные service/flow загружаются отдельным
чанком только для record с served/rated/done/fb. Entry/queue/preparing/ready
не запрашивают его. Стабильный lazy-компонент сохраняет draft между закрытием
и повторным открытием. Forget/day/identity/rollback очищают экземпляр.

Ошибка загрузки optional chunk сохраняет заказ и навигацию, показывает
существующее bootstrap сообщение/кнопку. Автоматических claim/feedback POST
или перезагрузок нет. Явное обновление выполняет ограниченный 3 s GET
только наблюдавшегося локального `/app/Rating-<hash>.js` (без query,
credentials, redirect и foreign origin), обновляет WebKit fetch cache,
затем перезагружает документ. Ошибка Performance API/сети не блокирует reload.
Telemetry сообщает только allowlisted render bucket, без exception/draft.

Точный диагностический отчёт: `review-evidence/perf-rating-2026-10-08/bundle-report.json`.
Bootstrap + обязательный dynamic mount + static imports: **113303 bytes,
110.65 KiB gzip**. Deferred Rating: 24367 bytes. ALL: **137670 bytes,
134.44 KiB gzip**. До изменения ALL/initial были 136761 bytes (133.56 KiB).
Первый экран уменьшен на 23458 bytes (~17.2%); ALL вырос на 909 bytes
из-за разделения и безопасного recovery. Это оптимизация первоначальной
загрузки, не достижение консервативного общего gate.

`check:size` и лимит 120 KiB оставлены без изменений: **FAIL**.
Есть расхождение scope: docs/02 §17 и docs/07 §12 задают 120 KiB *до первого
экрана*, а текущий script суммирует *все* чанки. Проверка не ослаблялась.
Обязательный граф entry/queue/preparing/ready ниже документированного бюджета;
это не измерение LCP и не гарантия бюджета любого восстановленного состояния.
Для served/rated record рейтинг прогружается отдельно; при прямом rate=1
он нужен для диалога. Полный pipeline — ещё не PASS.
Следующая оптимизация должна уменьшать ALL с сохранением функций/контрактов,
либо владелец gate должен явно разрешить проверку документированного графа
первого экрана. Пока такого решения нет, не отмечать size/phase gate PASS.

Исследованные и отвергнутые варианты: manual vendor chunks увеличивают ALL;
замена Link на публичные router hooks не уменьшает bundle; OXC target и
maxIterations не дают улучшения. Drop-console отдельно не решает бюджет
и не включён. Зависимости/lock не изменены. Данные размера rendered modules
не являются gzip-атрибуцией; крупнейшие — react-dom/router/query/zod.

## Проверки текущих исходников

- 434 unit/component; 256 Chromium/WebKit E2E: PASS.
- typecheck/lint/format/tokens/build: PASS; release без MSW/sourcemaps.
- 2 реальных рейтинговых browser flows (claim/create/rate/detail/storage)
  на собственной синтетической Docker-копии: PASS.
- WebKit chunk 503→явное обновление под production CSP, без feedback/claim
  POST: PASS (`docker-recovery-result.json`).
- Legacy `/tv`, `/staff`, `/stats`, guest `/` и `/board` и возврат —
  покрыты полным E2E прогоном. Backend reference git clean.
- Local E2E workers ограничены четырьмя вместо безлимитного запуска;
  это устранило гонку измерения loading в WebKit при перегрузке Mac.

Docker текущего production build: собственный
`iskendy-perf-spike-20261008`, localhost:8101, read-only, cap-drop ALL,
no-new-privileges, tmpfs, offline outbound transport, pinned backend
`7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b`. Production API не вызывался.

Q25 разрешён владельцем: `--color-rating-invitation-text` = точный чёрный.
Read-only Figma: mobile246:22878/desktop246:22936, fill/node/ancestor opacity=1.
Отдельный брендовый орнамент не подтверждён, не выдуман; оригинальные
OrderTicket орнаменты из их конкретных Figma slots сохранены.

## Возвращённый гостевой motion

Уточнение владельца: запрет касается анимации персонажей оценки, а не GSAP
для интерфейса. GSAP/@gsap/react пока **не установлены**. Шесть W7-задач
возвращены в план; текущий знаменатель **53** (22 done,16 partial,15 not started),
TV/staff/stats остаются legacy и вне этих шести задач.

Порядок после size gate и готовых гостевых состояний:
1. W7-1: отдельный lazy chunk, scoped useGSAP/cleanup, motion tokens,
   reduced-motion. Сначала подтвердить параметры и ADR, без новых эффектов.
2. W7-2: Loader/Steps по описаниям Figma; W7-3: главный переход ready и Dock.
3. W7-6: кнопки/чипы, magnet Slider, Dialog open/close с корректным focus,
   отменой timeline и повторным открытием.
4. W7-4/5: только после статичных Ticker/Popup/Float и чтения их полных
   описаний/правил. Персонажи — неизменённые статичные фото.

Бюджет не повышать; reduce без движения; transform/opacity без CLS;
cleanup на unmount/смену состояния; тесты normal/reduce и слабый Android.
Точные отсутствующие duration/easing не придумывать. Motion не реализован
раньше готового preview и size gate; push/deploy не выполнялись.

Новый публичный backend HEAD `166f35d63366a0da6551158fee4f2ba9760473c5`
обнаружен родителем; интеграционная база сознательно не обновлялась.
Все Docker результаты выше относятся только к `7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b`;
Родитель передал read-only сравнение: guest payload/response и legacy frontend
не изменены; claim limiter bucket изменён c→k, client reporting остаётся c;
добавлен X-Robots-Tag кроме корня iskendy.ru. Это сведения по исходникам,
не подтверждение live deployment. Интеграционный прогон нового commit
ещё не выполнен и не подменяет результаты на 7ab20f0. Защита frontend
от повторных claim сохранена.
