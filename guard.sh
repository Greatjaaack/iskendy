#!/bin/sh
# Сторож iskendy.ru: чинит что может сам, о результате пишет в рабочий чат.
#
# Замысел: владелец не должен быть частью системы. Поэтому порядок такой —
# сначала попытаться починить, потом сообщить, что сделано. Молча проглатывать
# проблему тоже нельзя: если что-то не так, в чат уходит сообщение в любом случае.
#
# Запускается кроном каждые 5 минут.
set -u

ENVF=/root/iskendy/.env
STATE=/var/lib/iskendy-guard
LOG=/var/log/iskendy-guard.log
DISK_LIMIT=${DISK_LIMIT:-88}          # с какого процента занятости чистим
mkdir -p "$STATE"

log() { echo "$(date -Is) $*" >> "$LOG"; }

# Значение из .env. Хвостовой комментарий («120   # пояснение») отрезаем, но
# только когда перед решёткой пробел: внутри токена или пароля она законна.
env_get() {
  grep -m1 "^$1=" "$ENVF" 2>/dev/null | cut -d= -f2- \
    | sed -E "s/[[:space:]]+#.*$//" | sed -E "s/^\"(.*)\"$/\1/"
}

# Сообщение в тему аварий рабочего чата.
tg() {
  _text="$1"
  _token=$(env_get TELEGRAM_BOT_TOKEN)
  _target=$(env_get TELEGRAM_ALERT_TARGETS)
  [ -z "$_token" ] || [ -z "$_target" ] && return 0
  _chat=${_target%%:*}
  _thread=""
  case "$_target" in *:*) _thread=${_target##*:} ;; esac
  # BOT_PROXY_URL держит адреса через запятую. Арендованный прокси — расходник:
  # когда он падает, сторож замолкает ровно тогда, когда нужен больше всего.
  # 09.09.2026 так и вышло — двое суток ни одного сообщения в чат.
  _proxies=$(env_get BOT_PROXY_URL)
  [ -z "$_proxies" ] && _proxies=" "      # пусто = одна попытка напрямую
  _dostavleno=""
  _old_ifs=$IFS
  IFS=,
  for _proxy in $_proxies; do
    IFS=$_old_ifs
    _proxy=$(printf %s "$_proxy" | tr -d "[:space:]")
    set -- --silent --output /dev/null --max-time 25
    [ -n "$_proxy" ] && set -- "$@" --proxy "$_proxy"
    [ -n "$_thread" ] && set -- "$@" --data-urlencode "message_thread_id=$_thread"
    if curl "$@" -X POST "https://api.telegram.org/bot$_token/sendMessage" \
         --data-urlencode "chat_id=$_chat" \
         --data-urlencode "text=$_text" \
         --data-urlencode "parse_mode=HTML"; then
      _dostavleno=1
      break
    fi
    # В лог только host:port — пароль прокси туда попасть не должен.
    log "прокси ${_proxy##*@} не ответил, пробую следующий"
    IFS=,
  done
  IFS=$_old_ifs
  [ -n "$_dostavleno" ] || log "не смог отправить в Telegram ни через один прокси"
}

# Сообщить один раз на проблему, а не каждые пять минут. Второй аргумент —
# «проблема ушла»: тогда снимаем отметку и говорим, что снова хорошо.
once() {
  _key="$STATE/$1"; _text="$2"
  if [ ! -f "$_key" ]; then : > "$_key"; tg "$_text"; log "алерт: $1"; fi
}
clear_once() {
  _key="$STATE/$1"
  if [ -f "$_key" ]; then rm -f "$_key"; tg "$2"; log "снято: $1"; fi
}

# Режим «просто отправь сообщение»: им пользуется скрипт выгрузки бэкапа,
# чтобы не дублировать у себя разбор .env и работу с прокси.
if [ "${1:-}" = "--notify-only" ]; then
  tg "${2:-пустое сообщение}"
  exit 0
fi

# Отметить проблему решённой и сказать об этом один раз. Нужен скрипту выгрузки
# бэкапа: он живёт отдельно, но тревоги должны сниматься так же, как ставятся.
if [ "${1:-}" = "--resolve" ]; then
  clear_once "${2:-unknown}" "${3:-✅ Проблема устранена}"
  exit 0
fi

if [ "${1:-}" = "--raise" ]; then
  once "${2:-unknown}" "${3:-Проблема}"
  exit 0
fi

# ---------------------------------------------------------------- сайт жив?
# Стучимся через Caddy, а не в контейнер напрямую: так проверяется весь путь,
# которым идёт гость. Один промах может быть случайностью — бьём дважды.
# Проверяем именно код 200. Первый вариант стучался по http и считал успехом
# ответ Caddy 308 (редирект на https) — проверка проходила даже при полностью
# остановленном контейнере. Идём сразу по https через локальный адрес: так
# щупается весь путь гостя, но без выхода в интернет.
HEALTH_URL=${HEALTH_URL:-https://iskendy.ru/api/health}
alive() {
  _code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -k \
          --resolve iskendy.ru:443:127.0.0.1 "$HEALTH_URL" 2>/dev/null)
  [ "$_code" = "200" ]
}

if alive; then
  clear_once site_down "✅ Сайт снова отвечает"
else
  sleep 20
  if alive; then
    log "первая проверка не прошла, вторая прошла — пропускаем"
  else
    log "сайт не отвечает, перезапускаю контейнер"
    docker restart iskendy >/dev/null 2>&1
    sleep 25
    if alive; then
      rm -f "$STATE/site_down"
      tg "🔄 Сайт не отвечал, контейнер перезапущен. Работает."
      log "перезапуск помог"
    else
      once site_down "🔴 Сайт не отвечает, перезапуск не помог. Заказы на бумагу."
      log "перезапуск НЕ помог"
    fi
  fi
fi

# ------------------------------------------------------- конфиг Caddy
# Наш сайт доступен снаружи только потому, что в общем Caddyfile есть блок
# iskendy.ru. Файл живёт в чужом репозитории (/root/dashboards), и 23.08.2026
# он разошёлся с git: блоков нашего сайта и bot.iskendy.ru в репозитории не
# было вовсе. Любой `git checkout Caddyfile` стёр бы конфигурацию насовсем.
#
# Проверяем две вещи. Первая — файл на диске совпадает с версией в git: иначе
# правку однажды затрут при обновлении. Вторая — контейнер читает тот же файл,
# что лежит на диске: Caddyfile смонтирован как ОДИН файл, а git при обновлении
# пишет новый и переименовывает, меняя inode, — монтирование остаётся на старом,
# и reload выглядит успешным, ничего при этом не меняя.
# Путь ищем, а не задаём: 27.08.2026 команда аналитики переносит Caddyfile в
# подкаталог caddy/ и монтирует каталогом вместо одиночного файла — это лечит
# грабли с inode, из-за которых reload читал старую версию. Жёсткий путь после
# переезда просто перестал бы существовать, и проверка молча пропускалась бы:
# сторож бы «работал», ничего не сторожа.
CADDY_DIR=/root/dashboards
CADDY_FILE=""
for _p in "$CADDY_DIR/caddy/Caddyfile" "$CADDY_DIR/Caddyfile"; do
  [ -f "$_p" ] && { CADDY_FILE="$_p"; break; }
done

if [ -z "$CADDY_FILE" ]; then
  # Конфига нет ни там, ни там — это не «нечего проверять», а пропажа файла,
  # от которого зависит доступность сайта снаружи.
  once caddy_propal "🔴 Конфиг Caddy не найден ни в caddy/Caddyfile, ни в корне $CADDY_DIR. Восстановить: docs/caddy.md"
else
  rm -f "$STATE/caddy_propal"
  if ! grep -q "iskendy.ru" "$CADDY_FILE" 2>/dev/null; then
    once caddy_bez_nas "🔴 В Caddyfile нет блока iskendy.ru. Сайт ляжет при перезапуске Caddy. Восстановить: docs/caddy.md"
  elif ! git -C "$CADDY_DIR" diff --quiet HEAD -- Caddyfile 2>/dev/null; then
    once caddy_rashozhdenie "⚠️ Caddyfile на сервере разошёлся с git. Свести версии."
  else
    clear_once caddy_rashozhdenie "✅ Конфиг Caddy снова совпадает с git"
    rm -f "$STATE/caddy_bez_nas"
  fi

  HOST_MD5=$(md5sum "$CADDY_FILE" 2>/dev/null | cut -d" " -f1)
  CONT_MD5=$(docker exec dashboards-caddy-1 md5sum /etc/caddy/Caddyfile 2>/dev/null | cut -d" " -f1)
  if [ -n "$HOST_MD5" ] && [ -n "$CONT_MD5" ] && [ "$HOST_MD5" != "$CONT_MD5" ]; then
    once caddy_ustarel "⚠️ Caddy читает старый конфиг (inode). Нужен --force-recreate caddy."
  else
    clear_once caddy_ustarel "✅ Caddy снова читает актуальный конфиг"
  fi
fi

# ----------------------------------------------------------------- диск
USED=$(df --output=pcent / | tail -1 | tr -dc "0-9")
if [ "${USED:-0}" -ge "$DISK_LIMIT" ]; then
  BEFORE=$(df --output=avail -h / | tail -1 | tr -d " ")
  docker image prune -f >/dev/null 2>&1
  docker builder prune -f >/dev/null 2>&1
  AFTER_PCT=$(df --output=pcent / | tail -1 | tr -dc "0-9")
  AFTER=$(df --output=avail -h / | tail -1 | tr -d " ")
  log "диск был ${USED}%, стал ${AFTER_PCT}%"
  if [ "$AFTER_PCT" -ge "$DISK_LIMIT" ]; then
    once disk_full "🔴 Диск ${AFTER_PCT}%, свободно $AFTER. Автоочистка не помогла."
  else
    rm -f "$STATE/disk_full"
    tg "🧹 Диск почищен: ${USED}% → ${AFTER_PCT}%, свободно $AFTER."
  fi
else
  # Место освободилось само (кто-то прибрался, съехал сосед). Раз о тревоге
  # сообщили, надо сообщить и о развязке: иначе в чате висит проблема, которой
  # уже нет, и следующее такое сообщение перестанут принимать всерьёз.
  clear_once disk_full "✅ С диском снова порядок: занято ${USED}%"
fi
