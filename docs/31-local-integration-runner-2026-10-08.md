# Локальный synthetic integration runner · W5-5 · 2026-10-08

Рабочая копия `/Users/maxgainullin/Projects/Iskendy-frontend`, ветка
`test/w5-5-local-integration-runner`, поверх **a5940ea** (W5-2).
`npm run test:e2e:real` больше не placeholder. Продуктовый код после a5940ea
не менялся; package.json/lockfile и зависимости не менялись.

## Повторяемый запуск

```sh
npm run test:e2e:real
# Другой локальный тестовый порт, исходная копия backend остаётся read-only:
E2E_BASE_URL=http://localhost:8105 npm run test:e2e:real
```

Уже имеющиеся prerequisites: Node из engines проекта, Docker Desktop с локальным
unix socket/context, установленный Playwright cache и cached image
`iskendy-local-spike:mac-20261008` с Python 3.12/locked backend dependencies.
Runner ничего системно не устанавливает и не меняет Docker settings/права.
Backend reference по умолчанию:
`/tmp/iskendy-backend-166f35d-reference-20261008`; можно явно задать
`E2E_BACKEND_REFERENCE`, но HEAD обязан совпасть с
**166f35d63366a0da6551158fee4f2ba9760473c5**, checkout обязан быть чистым.
При отсутствии prerequisites он завершится ошибкой, не скачивая новый backend/image.

Runner проверяет origin до запуска. Допустим только http на localhost/127.0.0.1
с непривилегированным портом; localhost приводится к 127.0.0.1. Порты 5180–5182,
query/path/credentials/hash и внешние адреса отвергаются. Это **создание своего
сервера**, не способ передать существующий пользовательский backend.

Reference клонируется локально в новый temporary context: только committed files,
ignored `.env`/БД не копируются. Затем собирается текущий frontend и image с
проверенным test runner из docs/29. Контейнер/тег имеют уникальные имена, root
read-only, cap-drop ALL, no-new-privileges, localhost binding и tmpfs для SQLite.
Lifespan, фоновые сервисы и outbound HTTP отключены в harness; исходный backend
не изменяется. Зависимости сверяются с poetry.lock внутри runner.

Повторяются ровно ранее проверенные templates из
`review-evidence/backend-166f35d-2026-10-08/`: HTTP limiter/claim/feedback/status,
4 rating flow (обе ветки × Chromium/WebKit), 2 live-status flow и 18 legacy/CSP
тестов. Копии templates/результаты/PNG/логи лежат в новой папке
`artifacts/real-backend-*`; исторический evidence не перезаписывается.
Summary содержит exact source revision и dirty flag; в этих проверках
frontend=a5940ea, dirty=true из-за добавлявшихся runner scripts/tests, продуктовый
код совпадал с a5940ea. Claim/edit/staff tokens не логируются.

При нормальном результате или пойманной ошибке удаляются только собственные
container/image tag/temporary context. Cached base image, backend references,
предыдущие контейнеры и пользовательские стенды сохраняются.

## Проверено

- Default 8104: полный ограниченный pipeline PASS, собственные ресурсы удалены.
- Второй запуск на localhost:8105: снова весь pipeline PASS, новая синтетическая
  БД без ошибок already; origin canonicalized, собственные ресурсы удалены.
- В каждом запуске: **4 rating + 2 status flow и 18 legacy/CSP PASS**, HTTP contracts
  и независимость лимитов client/event/claim PASS.
- Окончательный прогон на 8104 после защиты логов: снова весь pipeline PASS;
  собственные container/image tag удалены, generated trace=off, trace ZIP отсутствуют.
- 14 unit guards: внешние/поддельные localhost адреса, credentials, reserved ports,
  privileged port, path/query/hash/invalid URL отклоняются.
- 3 unit проверки редактирования Bearer/claim/edit/token/password в diagnostic logs;
  статусы/эндпоинты/несекретный текст сохраняются. Сетевые trace выключены в copied config.
- CLI с внешним URL прекращается до Docker/API; старый backend pin отвергается
  до создания container и HTTP.
- Собственная заглушка заняла 8104: docker-start получил 125; pipeline FAIL,
  containerRemoved=true, imageTagRemoved=true. После проверки заглушка остановлена.
  Среди Docker containers с нашим scope label ничего не осталось.
- **480 unit PASS**, 46 файлов. Typecheck/lint/format/tokens PASS.
- Полная продуктовая браузерная матрица на окончательном a5940ea: **328 PASS**.
  После него изменены только Node test tooling/tests/docs; реальная матрица повторена трижды, включая окончательную защиту логов.
- Normal Footer PNG по W5-2: 4/4 byte-identical старым; snapshots 5180/5181/5182:
  **115/115/122 файлов неизменны по bytes/SHA256**.

Evidence: `review-evidence/real-runner-2026-10-08/`, включая оба summary,
JSON flow results, limiter/legacy логи, ожидаемые fail-closed/cleanup результаты.
GUI пользователя не использовался. Production API, Docker settings, исходная
документация/backend и Dock/storage/claim UX не менялись. Push/deploy не выполнялись.

## Остаток

**W5-2 и W5-5 остаются частичными.** VoiceOver/TalkBack, реальные масштаб/ориентация,
полный progon, недостающие конечные сценарии и приёмка впереди. Reflow/text stress
не объявлены нативной проверкой устройств. Старый singleton не принят как финальная
модель покупки; новая Figma альтернатива здесь не реализовывалась.

ALL size gate по окончательному продуктовому коду: **139626 bytes / 136.35 KiB >
120 KiB, FAIL**; checker не повышен/не менялся. Roadmap **25 done / 18 partial /
10 not started из 53**. Формально закрытых фаз по-прежнему 0/6.
Независимый следующий кандидат: W5-1 parity существующего замороженного flow;
композиция и переключение заказов ожидают решения альтернативы.
