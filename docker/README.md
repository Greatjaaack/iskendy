# Docker-стенд нового фронта

Обвязка Искенди поверх `Max-Sundstrom/iskendy-frontend`: Docker-стенд с настоящим бэкендом табло, проверки в контейнере и наши доработки (`/tv`, сообщения и вложения гостей). Ветка у нас — `local/docker`, у автора — `arslan/integraciya`; `main` автора не трогаем. Node на хосте не нужен: всё собирается в контейнере на Node 24.19.

## Быстрый старт

Нужен Docker Desktop: не меньше 6 ГБ памяти и 4 ядер ВМ (Settings → Resources).

1. Положить оба репозитория рядом, бэкенд — под именем `iskendy_site`, его ждёт `compose.yml` (`../../iskendy_site` от `docker/`):

   ```sh
   mkdir iskendi && cd iskendi
   git clone -b arslan/integraciya https://github.com/Max-Sundstrom/iskendy-frontend.git
   # пока ветки у автора нет — та же ветка лежит в репозитории табло:
   # git clone -b front https://github.com/Greatjaaack/iskendy.git iskendy-frontend
   git clone -b feature/new-guest-front https://github.com/Greatjaaack/iskendy.git iskendy_site
   cd iskendy-frontend
   ```

   Ветка табло `feature/new-guest-front` — с ручками `POST /api/guest/message` и `/api/feedback/files` (сообщение управляющему и вложения). На `main` табло их пока нет: стенд работает, но отправка сообщения и фото получит 404.

2. Поднять стенд:

   ```sh
   docker compose -f docker/compose.yml up -d --build      # mock :5173 и stack :8090, первая сборка ~5–10 мин
   ```

3. Открыть:

   | Что | Адрес |
   |---|---|
   | Фронт на синтетике (MSW) | http://127.0.0.1:5173 |
   | Фронт + настоящий бэкенд | http://127.0.0.1:8090 — `/`, `/board`, `/tv` |
   | Касса (двигать заказы) | http://127.0.0.1:8090/staff, пароль `local-test` |

4. Проверки — `docker compose -f docker/compose.yml run --rm verify` (см. ниже).

Остановить — `docker compose -f docker/compose.yml down`.

## Раскладка

| Что | Где |
|---|---|
| Новый фронт (этот репо) | `iskendy-frontend`, ветка `local/docker` (у автора — `arslan/integraciya`) |
| Бэкенд табло | `../iskendy_site` — берётся из рабочего дерева как есть, на той ветке, что выбрана |
| Наши документы | `local/` (оглавление — `local/README.md`) |

## Сервисы

Все команды — из корня репозитория.

| Сервис | Команда | Адрес | Что внутри |
|---|---|---|---|
| **mock** | `docker compose -f docker/compose.yml up -d --build mock` | http://127.0.0.1:5173 | Vite + MSW, синтетика: 112 готовим, 102 готово, 997/998/996 выданы. Сценарии — `/dev/scenarios.html` |
| **stack** | `docker compose -f docker/compose.yml up -d --build stack` | http://127.0.0.1:8090 | Настоящий бэкенд табло + production-сборка фронта. Касса, Telegram, бэкап выключены (`stack.env`), пароль кассы `local-test` |
| **verify** | `docker compose -f docker/compose.yml run --rm verify` | — | Все проверки по шагам: typecheck, lint, токены, unit, сборка, бюджет размера, e2e (Chromium + WebKit). Итог — в терминале и `docker/out/summary.txt`, логи шагов и отчёт Playwright — в `docker/out/` |

`up -d --build` без имени сервиса поднимает mock и stack. verify в `up` не входит (профиль `test`).

Порты 8098/8099 не занимать: их берёт `scripts/progon.py` табло.

## verify: потоки и память

ВМ Docker на маке — 6 ГБ и 6 ядер. При 4 и более воркерах десятки unit-тестов падали по таймауту 5 с, а e2e умирали по памяти (код 137). Поэтому по умолчанию unit идёт в 2 потока, e2e — в 1 (~30 мин), лимит контейнера 4 ГБ.

```sh
docker compose -f docker/compose.yml run --rm verify                      # всё
SKIP_E2E=1 docker compose -f docker/compose.yml run --rm verify           # без e2e, ~5 мин
E2E_WORKERS=2 docker compose -f docker/compose.yml run --rm verify        # быстрее, если Docker свободен
```

**Один прогон за раз.** Два verify одновременно (например, из двух сессий Claude) дают ложные таймауты в обоих. Перед запуском проверить `docker ps`.

Известные платформенные падения: 3 пиксельные проверки витрины в Chromium под Linux (у автора на маке зелёные, WebKit проходит).

## stack: как подвигать заказ

Касса стенда — http://127.0.0.1:8090/staff, пароль `local-test`. Через API:

```sh
B=http://127.0.0.1:8090
T=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"password":"local-test"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST $B/api/order        -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"number":41}'
curl -s -X POST $B/api/order/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"number":41,"status":"ready"}'   # потом served
```

Касса одна на систему: новый вход при открытой сессии — 409. Сбросить — `down -v` (база стенда с нуля).

Реверс-сценарии против stack — `local/e2e/` (запуск — в `local/audit-2026-10-16.md`).

## stack с настоящей кассой (iiko / Saby)

Для интеграционных прогонов стенд можно подключить к ручке заказов аналитики — табло берёт заказы оттуда, а аналитика — из iiko или Saby Presto.

1. `cp docker/stack.local.env.example docker/stack.local.env` — в git не попадает.
2. Вписать `KASSA_ORDERS_URL` и `KASSA_INTERNAL_TOKEN`: локальная аналитика или ssh-туннель к боевой (оба варианта расписаны в образце).
3. `docker compose -f docker/compose.yml up -d --force-recreate stack`.
4. Проверка: `docker compose -f docker/compose.yml logs -f stack` — поллер пишет об ошибках; заказы дня появляются на http://127.0.0.1:8090/tv.

Telegram на стенде выключен и должен оставаться выключенным: иначе алерты стенда уйдут в рабочий чат.

## Обновление

```sh
git fetch origin && git rebase origin/main          # свежий фронт автора под нашей обвязкой
docker compose -f docker/compose.yml up -d --build  # пересобрать mock и stack
```

Нужная ветка бэкенда — `git checkout` в `iskendy_site` и пересборка stack.

## В прод

Только через табло: `iskendy_site/scripts/import-frontend.sh` собирает цель `dist` из чистого клона на нужном коммите, проверяет состав и то, что `legacy.html` совпадает с текущим экраном кассы, и кладёт сборку во `frontend/`. Дальше — обычный релиз табло: dev → main → ночная выкатка (скилл `prod-server`), смоук — `scripts/smoke-front.sh`. Подробно — `local/plan-docker.md`.

## Остановить и почистить

```sh
docker compose -f docker/compose.yml down        # контейнеры
docker compose -f docker/compose.yml down -v     # + база стенда
docker image prune -f && docker builder prune -f --filter until=168h   # мусор сборок
```

## Подводные камни

- `VERSION` помечается `-dirty`, если в рабочем дереве есть незакоммиченные правки: сборка берёт коммит и состояние из `.git`.
- Уведомления и service worker требуют защищённого origin: на `127.0.0.1` работают, по IP из локальной сети — нет.
