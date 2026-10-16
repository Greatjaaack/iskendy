#!/bin/sh
# Смоук сайта после выкатки — только чтение, никаких подписок, оценок и входов.
#
#   scripts/smoke-front.sh [БАЗОВЫЙ_АДРЕС]     по умолчанию https://iskendy.ru
#
# Годится и для прежнего фронта, и для нового (iskendy-frontend): проверки,
# которые есть только у нового, включаются, если сайт отдаёт /VERSION.
# Код возврата 0 — всё в порядке; иначе печатает, что не так.
set -u

BASE=${1:-https://iskendy.ru}
BASE=${BASE%/}
FAIL=0
ok()  { echo "  ✓ $*"; }
bad() { echo "  ✗ $*"; FAIL=1; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$1"; }
header() { curl -s -D - -o /dev/null --max-time 10 "$BASE$1" | tr -d '\r' | grep -i "^$2:" | cut -d' ' -f2-; }
body() { curl -s --max-time 10 "$BASE$1"; }

echo "smoke: $BASE"
for p in / /board /tv /staff /stats /sw.js /api/health /api/status /api/feedback/config; do
  c=$(code "$p"); [ "$c" = 200 ] && ok "$p 200" || bad "$p → $c"
done

body /api/status | grep -q '"orders"' && ok "/api/status — табло в ответе" || bad "/api/status без orders"

# Индексация: в поиске только главная iskendy.ru (память indexaciya-tolko-glavnaya).
for p in /board /tv /staff /stats; do
  header "$p" X-Robots-Tag | grep -q noindex && ok "$p noindex" || bad "$p без noindex"
done
case "$BASE" in
  https://iskendy.ru) [ -z "$(header / X-Robots-Tag)" ] && ok "/ индексируется" || bad "/ закрыт от поиска" ;;
esac

# Служебные экраны — всегда прежний экран, а не JS-загрузчик.
for p in /tv /staff /stats; do
  body "$p" | grep -q 'staff-view' && ok "$p — экран кассы/ТВ" || bad "$p отдаёт не экран кассы/ТВ"
done

if [ "$(code /VERSION)" = 200 ]; then
  echo "  новый фронт: $(body /VERSION | sed -n '1p;2p' | tr '\n' ' ')"
  [ "$(code /legacy.html)" = 200 ] && ok "/legacy.html 200" || bad "/legacy.html нет"
  JS=$(body / | grep -o '/app/[^"]*\.js' | head -1)
  if [ -n "$JS" ]; then
    [ "$(code "$JS")" = 200 ] && ok "$JS 200" || bad "$JS → $(code "$JS")"
    header "$JS" Cache-Control | grep -q immutable && ok "/app/ кэшируется навсегда" || bad "/app/ без immutable"
  else
    bad "в index.html нет /app/*.js"
  fi
fi
header / Cache-Control | grep -q no-cache && ok "/ no-cache" || bad "/ без no-cache"

[ "$FAIL" = 0 ] && echo "smoke: OK" || echo "smoke: ЕСТЬ ПРОБЛЕМЫ"
exit "$FAIL"
