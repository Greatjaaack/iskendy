#!/bin/sh
# Собрать новый гостевой фронт (iskendy-frontend) и положить сборку во frontend/.
#
#   scripts/import-frontend.sh [--dest DIR] [--allow-legacy-change] [ПУТЬ_К_КЛОНУ] [КОММИТ]
#
#   ПУТЬ_К_КЛОНУ  по умолчанию ../iskendy-frontend
#   КОММИТ        по умолчанию HEAD клона; сборка идёт из чистого локального
#                 клона на этом коммите — незакоммиченные правки в неё не попадают
#   --dest DIR    куда положить сборку (по умолчанию frontend/ этого репо);
#                 для пробного прогона — любой пустой каталог
#   --allow-legacy-change
#                 разрешить, чтобы legacy.html сборки отличался от нашего
#                 текущего экрана кассы/ТВ (см. ниже)
#
# Сборка — `docker build --target dist` по Dockerfile из клона (ветка
# local/docker), Node на маке не нужен. Скрипт ничего не коммитит: после него —
# `git diff --stat frontend/`, тесты, прогон, коммит в dev (precommit-checklist).
#
# Почему проверка legacy. Касса, ТВ и статистика — это прежний index.html,
# который фронт везёт снимком как legacy.html. Если у нас кассу правили, а снимок
# во фронте старый, импорт молча откатит правку. Поэтому legacy.html сборки
# обязан совпасть байт в байт с текущим экраном (frontend/legacy.html, а до
# первого импорта — frontend/index.html), иначе скрипт останавливается.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST="$ROOT/frontend"
ALLOW_LEGACY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dest) DEST=$2; shift 2 ;;
    --allow-legacy-change) ALLOW_LEGACY=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) break ;;
  esac
done
FRONT=$(cd "${1:-$ROOT/../iskendy-frontend}" && pwd)
REV=${2:-HEAD}

die() { echo "import-frontend: $*" >&2; exit 1; }
[ -f "$FRONT/docker/Dockerfile" ] || die "нет $FRONT/docker/Dockerfile (нужна ветка local/docker)"
COMMIT=$(git -C "$FRONT" rev-parse --verify "$REV^{commit}") || die "нет коммита $REV"

WORK=$(mktemp -d)
IMAGE="iskendy-web-dist:import-$$"
cleanup() {
  docker rm -f "iskendy-web-import-$$" >/dev/null 2>&1 || true
  docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

echo "import-frontend: собираю $(git -C "$FRONT" log -1 --format='%h %s' "$COMMIT")"
# Клон, а не worktree: в worktree .git — файл со ссылкой на путь хоста, и
# внутри docker-сборки git не нашёл бы репозиторий (VERSION берёт коммит из git).
git clone -q --no-checkout "$FRONT" "$WORK/src"
git -C "$WORK/src" checkout -q --detach "$COMMIT"
docker build -q -f "$WORK/src/docker/Dockerfile" --target dist \
  -t "$IMAGE" "$WORK/src" >/dev/null
docker create --name "iskendy-web-import-$$" "$IMAGE" >/dev/null
docker cp "iskendy-web-import-$$:/web/dist" "$WORK/dist"

# Состав сборки — ровно то, что описано в docs/08-delivery.md фронта.
for f in index.html legacy.html sw.js VERSION ROUTES.json app assets; do
  [ -e "$WORK/dist/$f" ] || die "в сборке нет $f"
done
EXTRA=$(ls "$WORK/dist" | grep -vxE 'index.html|legacy.html|sw.js|VERSION|ROUTES.json|app|assets' || true)
[ -z "$EXTRA" ] || die "лишнее в сборке: $EXTRA"
! find "$WORK/dist" -name '*.map' | grep -q . || die "в сборке карты исходников (.map)"
grep -q "^commit: $COMMIT\$" "$WORK/dist/VERSION" \
  || die "VERSION не совпадает с коммитом $COMMIT (грязное дерево?): $(sed -n 2p "$WORK/dist/VERSION")"

# Экран кассы/ТВ не должен откатиться (см. шапку).
CURRENT="$ROOT/frontend/legacy.html"
[ -f "$CURRENT" ] || CURRENT="$ROOT/frontend/index.html"
if ! cmp -s "$CURRENT" "$WORK/dist/legacy.html"; then
  [ "$ALLOW_LEGACY" = 1 ] || die "legacy.html сборки отличается от $CURRENT — касса/ТВ откатятся. Сначала перенести правки в legacy/ фронта, или --allow-legacy-change"
  echo "import-frontend: ВНИМАНИЕ — legacy.html меняется (разрешено флагом)"
fi
cmp -s "$ROOT/frontend/sw.js" "$WORK/dist/sw.js" \
  || echo "import-frontend: ВНИМАНИЕ — sw.js отличается от текущего"

mkdir -p "$DEST"
# Заменяем содержимое целиком: файлы прошлой сборки с другими хэшами не нужны.
find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$WORK/dist/." "$DEST/"
echo "import-frontend: готово → $DEST"
sed -n 1,3p "$DEST/VERSION"
