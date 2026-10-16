# Локальный запуск нового фронта · Docker

Локальная обвязка Искенди поверх чужого репозитория `Max-Sundstrom/iskendy-frontend`.
Живёт в ветке `local/docker`, наружу не пушится. Node на хосте не нужен (проекту нужен 24.19, на маке стоит 23).

## Раскладка

| Что | Где |
|---|---|
| Новый фронт (этот репо) | `~/Desktop/iskendi/iskendy-frontend` |
| Бэкенд табло | `~/Desktop/iskendi/iskendy_site` — берётся как есть, код не меняется |
| Проект PyCharm | `.idea/` в корне (исключён через `.git/info/exclude`) |

## Три режима

| Режим | Команда | Адрес | Что внутри |
|---|---|---|---|
| **mock** | `docker compose -f docker/compose.yml up -d --build mock` | http://127.0.0.1:5173 | Vite + MSW, синтетические заказы, без бэкенда. Номера: 112 готовим, 102 готово, 997/998/996 выданы |
| **stack** | `docker compose -f docker/compose.yml up -d --build stack` | http://127.0.0.1:8098 | Настоящий бэкенд `iskendy_site` + production-сборка нового фронта во `frontend/`. Касса, Telegram, бэкап выключены (`docker/stack.env`) |
| **verify** | `docker build -f docker/Dockerfile --target verify -t iskendy-frontend-verify .` | — | Штатный `npm run verify`: типы, lint, токены, unit, сборка, бюджет размера, e2e в Chromium и WebKit. Отчёт: `docker run --rm iskendy-frontend-verify tail -80 /verify.log` |

Сценарии mock: http://127.0.0.1:5173/dev/scenarios.html, витрина компонентов — `npm run dev:kit` (в контейнере не поднята).

## Стенд stack: как подвигать заказ

Пароль кассы стенда — `local-test` (только локально). Экран кассы: http://127.0.0.1:8098/staff. Через API:

```sh
B=http://127.0.0.1:8098
T=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"password":"local-test"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST $B/api/order        -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"number":41}'
curl -s -X POST $B/api/order/status -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"number":41,"status":"ready"}'   # потом served
```

Касса одна: вход с нового устройства выбивает прежнее (409 — «уже открыта»), для стенда это норма.

## Обновление

```sh
git fetch origin && git rebase origin/main          # свежий фронт поверх локальной обвязки
docker compose -f docker/compose.yml up -d --build  # пересобрать оба режима
```

Бэкенд для `stack` берётся из рабочего дерева `iskendy_site` в момент сборки: нужная ветка табло — просто `git checkout` там и пересборка.

## Остановить и почистить

```sh
docker compose -f docker/compose.yml down        # контейнеры
docker compose -f docker/compose.yml down -v     # + база стенда
```

## Подводные камни

- `VERSION` в сборке помечен `-dirty`, если в рабочем дереве есть незакоммиченные правки: сборка берёт коммит из `.git`.
- Уведомления и service worker требуют защищённого origin: на `127.0.0.1` работают, по IP из локальной сети — нет.
- Порт 8098 выбран, чтобы не пересекаться с обычным `iskendy_site` (8080) и с `iskendy-check` (8099) из инструкций автора.
