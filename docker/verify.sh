#!/bin/sh
# Полный прогон проверок фронта внутри контейнера test — по шагам, с итогом.
#   docker compose -f docker/compose.yml run --rm verify
# Переменные: UNIT_WORKERS (2), E2E_WORKERS (1), SKIP_E2E=1, OUT (/out).
# Почему мало потоков: ВМ Docker на маке — 6 ГБ и 6 ядер. При 4+ воркерах
# vitest десятки тестов падали по таймауту 5 с, а e2e умирали по памяти (137).
# Два прогона одновременно (две сессии) дают те же ложные падения — один за раз.
set -u
cd /web
OUT=${OUT:-/out}
mkdir -p "$OUT"
rm -f "$OUT"/*.log
STATUS=0
step() {
  name=$1; shift
  started=$(date +%s)
  if "$@" > "$OUT/$name.log" 2>&1; then res=OK; else res=FAIL; STATUS=1; fi
  printf '%-10s %-5s %4ss  %s\n' "$name" "$res" "$(( $(date +%s) - started ))" "$OUT/$name.log" \
    | tee -a "$OUT/summary.txt"
}
: > "$OUT/summary.txt"
echo "verify: $(git log -1 --format='%h %s' 2>/dev/null)" | tee -a "$OUT/summary.txt"
step typecheck npm run typecheck
step lint npm run lint
step tokens npm run check:tokens
step unit npx vitest run --coverage --maxWorkers="${UNIT_WORKERS:-2}"
step build npm run build
step size npm run check:size
[ "${SKIP_E2E:-0}" = 1 ] || step e2e npx playwright test --workers="${E2E_WORKERS:-1}"
{
  sed 's/\x1b\[[0-9;]*m//g' "$OUT/unit.log" | grep -E '^ +(Test Files|Tests) ' || true
  grep -h 'First screen' "$OUT/size.log" 2>/dev/null || true
  [ -f "$OUT/e2e.log" ] && sed 's/\x1b\[[0-9;]*m//g' "$OUT/e2e.log" \
    | grep -E '^ +[0-9]+ (passed|failed|flaky|skipped)' || true
} | tee -a "$OUT/summary.txt"
rm -rf "$OUT/playwright-report" && cp -R playwright-report "$OUT/" 2>/dev/null || true
echo "verify: $([ $STATUS = 0 ] && echo OK || echo FAIL)" | tee -a "$OUT/summary.txt"
exit $STATUS
