"""Табло заказов «Искенди» — FastAPI-сервис.

Публично: GET /api/status (гостевое табло: что готовится / что готово).
Под токеном персонала: POST /api/order (занести), /api/order/status
(двигать статус), /api/order/delete, /api/day/reset.
Фронт (frontend/) отдаётся как статика: гостевое табло + экран кассы.
"""

import asyncio
import hashlib
import io
import logging
import ipaddress
import re
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlparse

import backup
import db
import notify
import segno
from auth import issue_token, require_staff, verify_password
from config import settings
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from iiko_poller import run_poller
from pydantic import BaseModel, Field

# Единый формат для всех строк: раньше события приложения шли со временем, а
# access-строки uvicorn — вообще без него, и по логу нельзя было сказать, когда
# случился запрос. Миллисекунды убраны: для разбора смены хватает секунд.
_LOG_FORMAT = "%(asctime)s %(levelname)-5s %(message)s"
_LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"
logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT, datefmt=_LOG_DATEFMT)


def _add_file_log() -> None:
    """Дублировать лог в файл внутри volume, рядом с базой.

    docker logs живут ровно столько, сколько живёт контейнер: любой деплой
    пересоздаёт его, и вся история исчезает. Проверено на проде — там лежало
    пять дней, ровно с последней пересборки, а всё, что было до неё, стёрлось.

    Файл в volume это переживает. Шесть кусков по 5 МБ — с учётом того, что
    опрос табло больше не пишется, это несколько месяцев истории при жёстком
    потолке в 30 МБ.
    """
    log_dir = Path(settings.db_path).resolve().parent / "logs"
    try:
        log_dir.mkdir(exist_ok=True)
        handler = RotatingFileHandler(
            log_dir / "app.log", maxBytes=5 * 1024 * 1024, backupCount=5,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_LOG_DATEFMT))
        logging.getLogger().addHandler(handler)
    except OSError as exc:
        # Не смогли завести файл — не повод не подниматься: в docker logs
        # всё равно пишем, и сайт важнее истории логов.
        logging.getLogger().warning("файловый лог недоступен: %s", exc)


_add_file_log()
# httpx на INFO печатает полный URL запроса, а у Telegram Bot API токен зашит
# прямо в путь — в docker logs он светиться не должен. Ошибки отправки мы и так
# логируем сами (notify.py), так что ничего не теряем.
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="Искенди — табло заказов")


# Пути, которые в лог не пишем. Табло опрашивает статус раз в пять секунд с
# каждого гостевого телефона — за пять дней это дало 109 278 строк из 119 231,
# то есть 92% лога. Полезное в этом шуме не находится, а диск он ест исправно.
# Ошибки (код 400 и выше) пишем всегда, даже для этих путей.
QUIET_PATHS = ("/api/status", "/api/health", "/assets/", "/favicon")

access = logging.getLogger("access")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Защитные заголовки и запись запроса в лог.

    Заголовки ставим в приложении, а не в общем Caddyfile: тот обслуживает и
    соседние стеки компании, и трогать его ради одного сайта рискованно.

    Access-лог пишем сами, а не средствами uvicorn: тому виден только адрес
    соединения, то есть всегда Caddy (172.19.0.4), — по такому логу нельзя
    отличить одного гостя от другого и разобрать, откуда шла подозрительная
    активность. Настоящий адрес умеет доставать только _client_ip.
    """
    started = time.monotonic()
    response = await call_next(request)
    path = request.url.path
    if response.status_code >= 400 or not path.startswith(QUIET_PATHS):
        access.info(
            "%s %s %s · %s · %dмс",
            request.method, path, response.status_code,
            _client_ip(request), (time.monotonic() - started) * 1000,
        )
    # Кассу и аналитику нельзя встраивать в чужую страницу (кликджекинг).
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = CSP
    return response

# Content-Security-Policy. Второй рубеж на случай, если где-то пропустят
# экранирование: даже тогда чужой скрипт с чужого адреса не загрузится, а увести
# данные будет некуда — connect-src закрыт своим origin.
#
# 'unsafe-inline' обязателен и снимает часть защиты: весь JS страницы инлайновый,
# обработчики висят в onclick. Убрать его можно только переписав фронт целиком
# (внешние файлы + addEventListener) — до тех пор CSP ограничивает ИСТОЧНИКИ, но
# не внедрённый в разметку код.
#
# Что и зачем разрешено, кроме своего origin:
#   mc.yandex.ru        — Метрика: скрипт, пиксель, отправка данных, iframe вебвизора
#   fonts.googleapis.com / fonts.gstatic.com — шрифты Bebas Neue и IBM Plex
#   data:               — орнамент и QR рисуются в SVG прямо на странице
#   blob:               — вебвизор Метрики поднимает воркер
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://mc.yandex.ru",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://mc.yandex.ru",
    "connect-src 'self' https://mc.yandex.ru",
    "frame-src https://mc.yandex.ru",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
])

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
async def _startup() -> None:
    db.init_db()
    # Фоновый поллер заказов из iiko (если настроен URL/токен аналитики).
    asyncio.create_task(run_poller())
    # Ежедневный бэкап БД.
    asyncio.create_task(backup.run_backup_loop())


def _payload(board: dict) -> dict:
    """Ответ табло: активные заказы + серверное время (для меток на фронте)."""
    return {**board, "now": db.now_hm()}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/status")
def get_status() -> dict:
    return _payload(db.get_board())


class LoginBody(BaseModel):
    password: str


@app.post("/api/auth/login")
async def login(request: Request, body: LoginBody) -> dict:
    """Пароль персонала → JWT. Одна активная сессия, лимит попыток.

    Касса — один планшет за столом, залогиненный месяцами (пароль вводить
    неудобно, поэтому токен долгий). Значит вторая сессия по тому же паролю —
    это не «хозяин зашёл с телефона», а сигнал: пароль ушёл на сторону. Такой
    вход отклоняем и шлём алерт владельцу; планшет при этом не трогаем, чтобы
    смена не осталась без кассы посреди дня.
    """
    _guard(request, RATE_LIMIT_LOGIN, "l")
    ip, ua = _client_ip(request), request.headers.get("user-agent", "")
    if not verify_password(body.password):
        db.log_security("login_failed", ip, ua=ua[:200])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный пароль"
        )
    active = db.session_active()
    if active is not None:
        db.log_security("login_blocked", ip, ua=ua[:200],
                        activeSince=active.get("createdAt"))
        _fire(notify.notify_login_blocked(active, ip=ip, ua=ua))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Касса уже открыта на другом устройстве. "
                   "Нажмите «Выйти» там — или обратитесь к владельцу.",
        )
    token, jti = issue_token()
    db.session_start(jti, ip=ip, ua=ua)
    db.log_security("login_ok", ip, ua=ua[:200])
    return {"token": token}


@app.post("/api/auth/logout")
def logout(request: Request, _: dict = Depends(require_staff)) -> dict:
    """Освободить кассу. Только с действующим токеном — чужой выход невозможен."""
    db.session_end()
    db.log_security("logout", _client_ip(request))
    return {"ok": True}


@app.get("/api/auth/session")
def auth_session(_: dict = Depends(require_staff)) -> dict:
    """Кто сейчас за кассой — для экрана персонала."""
    return {"session": db.session_active()}


class OrderBody(BaseModel):
    number: int = Field(gt=0, le=100000)


class StatusBody(BaseModel):
    number: int = Field(gt=0, le=100000)
    status: str


@app.post("/api/order")
def order_add(body: OrderBody, _: dict = Depends(require_staff)) -> dict:
    """Занести новый заказ (статус «готовится»)."""
    try:
        return _payload(db.add_order(body.number))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@app.post("/api/order/status")
def order_status(body: StatusBody, _: dict = Depends(require_staff)) -> dict:
    """Перевести заказ в новый статус: preparing / ready / served."""
    try:
        return _payload(db.set_status(body.number, body.status))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/order/delete")
def order_delete(body: OrderBody, _: dict = Depends(require_staff)) -> dict:
    """Удалить активный заказ (ошибочно занесён)."""
    try:
        return _payload(db.delete_order(body.number))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.get("/api/history")
def history(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _: dict = Depends(require_staff),
) -> dict:
    """История заказов за день (включая выданные) с метками времени приёма /
    готовности / выдачи — для персонала. `date` (YYYY-MM-DD) — по умолчанию
    сегодня; выданные хранятся постоянно, так что доступны прошлые дни."""
    day = date or db.today()
    return {"date": day, "orders": db.get_history(day), "now": db.now_hm()}


@app.get("/api/events")
def events(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _: dict = Depends(require_staff),
) -> dict:
    """Журнал событий заказов за день (создание/смена статуса/удаление/сброс) —
    для аудита: кто когда что переключил. `date` (YYYY-MM-DD) — по умолчанию сегодня."""
    day = date or db.today()
    return {"date": day, "events": db.get_events(day), "now": db.now_hm()}


@app.get("/api/stats/days")
def stats_days(_: dict = Depends(require_staff)) -> dict:
    """Аналитика по дням: заказов и средние времена этапов (для персонала)."""
    return {"days": db.stats_days()}


@app.get("/api/stats/range")
def stats_range(
    dates: str = Query(default=""),
    _: dict = Depends(require_staff),
) -> dict:
    """Сводка + разбивка по часам за выбранные дни. `dates` — список дат через
    запятую (YYYY-MM-DD). Пустой — сегодня."""
    valid = [d for d in dates.split(",") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)]
    if not valid:
        valid = [db.today()]
    return {"dates": valid, **db.stats_range(valid)}


@app.get("/api/stats/orders")
def stats_orders(
    dates: str = Query(default=""),
    limit: int = Query(default=db.ORDERS_PATH_LIMIT, ge=1, le=2000),
    _: dict = Depends(require_staff),
) -> dict:
    """Путь каждого заказа за выбранные дни: время в каждом статусе, приём и
    выдача. `dates` — список дат через запятую (YYYY-MM-DD). Пустой — сегодня."""
    valid = [d for d in dates.split(",") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)]
    if not valid:
        valid = [db.today()]
    return {"dates": valid, **db.stats_orders(valid, limit)}


@app.get("/api/backup/list")
def backup_list(_: dict = Depends(require_staff)) -> dict:
    """Список бэкапов БД (имя + размер) — для персонала."""
    files = sorted(backup.backups_dir().glob("iskendy-*.db.gz"), reverse=True)
    return {"backups": [{"name": f.name, "size": f.stat().st_size} for f in files]}


@app.get("/api/backup/latest")
def backup_latest(_: dict = Depends(require_staff)) -> FileResponse:
    """Скачать последний бэкап БД (gzip) — чтобы держать копию вне сервера."""
    latest = backup.latest_backup()
    if latest is None:
        # ещё нет за сегодня — снимем прямо сейчас
        latest = backup.make_backup() or backup.latest_backup()
    if latest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Нет бэкапов")
    return FileResponse(latest, media_type="application/gzip", filename=latest.name)


@app.post("/api/day/reset")
def day_reset(_: dict = Depends(require_staff)) -> dict:
    """Очистить все заказы за сегодня (новый день)."""
    return _payload(db.reset_day())


@app.get("/api/qr")
def qr(
    request: Request,
    data: str = Query(max_length=512),
    border: int = Query(default=2, ge=0, le=8),
) -> Response:
    """SVG QR-кода для страницы этого же сайта. `border` — «тихая зона» в
    модулях (белая рамка): 2 для печати, поменьше для экрана табло.
    Генерится локально, без внешних сервисов.

    Ручка открытая (QR табло рисуется гостям), поэтому кодируем только свои
    адреса. Раньше сюда годилась любая строка — и получался генератор QR на
    чужой сайт, отдаваемый с домена ресторана: мошеннику оставалось напечатать
    такой код на листовке «оплатите заказ», а проверка источника показывала бы
    iskendy.ru.
    """
    data = _own_url(request, data)
    buff = io.BytesIO()
    segno.make(data, error="m").save(
        buff, kind="svg", scale=8, border=border, dark="#17130f", light="#ffffff"
    )
    return Response(content=buff.getvalue(), media_type="image/svg+xml")


# ---------------------- Отзывы гостей (docs/feedback-flow.md) ----------------
# Гостевые ручки — без авторизации (гость на /board никакого токена не имеет),
# поэтому с защитой: одна оценка на заказ (уникальный индекс в БД), rate-limit по
# IP и окно в 30 минут на дописывание деталей.

# Тексты отказов живут здесь, а не в БД: формулировки для гостя — вопрос тона,
# правятся в одном месте. Коды причин приходят из db.
REASON_TEXT = {
    "not_found": "Не нашли такой заказ за сегодня. Проверьте номер на чеке",
    "not_served": "Заказ ещё готовится — оцените, когда заберёте",
    "already": "Спасибо, отзыв по этому заказу уже принят",
    "expired": "Время истекло, но оценку мы записали — спасибо",
    "unknown_feedback": "Не нашли эту оценку — оцените заказ заново",
    "wrong_token": "Не получилось дописать отзыв — оцените заказ заново",
    "locked": "Отзыв уже отправлен — спасибо!",
    "taken": "Этот номер уже отслеживают с другого телефона",
    "too_many": "Слишком много заказов с одного телефона за сегодня",
    "not_claimed": "Оценить заказ можно с того телефона, на котором вы за ним следили",
}

# Лимиты на минуту с одного адреса. Важно: в зале все телефоны выходят через
# один публичный IP (гостевой Wi-Fi, мобильный NAT), поэтому лимит — не «на
# гостя», а «на весь зал». Отсюда два разных потолка: проверка статуса дешёвая и
# её дёргает каждый подписанный гость, а запись отзыва — редкое событие.
# От накрутки защищает не этот счётчик, а «один заказ — один отзыв» в БД.
RATE_LIMIT_WINDOW = 60  # секунд
RATE_LIMIT_READ = 120  # GET /api/feedback/check
RATE_LIMIT_WRITE = 20  # POST /api/feedback и /api/feedback/detail
# Шаги воронки: пишет каждый гость по нескольку раз за визит, а в зале все сидят
# под одним IP. Потолок высокий — потерять шаг не страшно, но и не заваливать БД.
RATE_LIMIT_STEP = 240  # POST /api/guest/event
# Вход персонала. Пароль один и открывает всё: кассу, аналитику, инбокс отзывов с
# контактами гостей и выгрузку базы. Персонал логинится редко (токен живёт сутки),
# так что десяти попыток в минуту хватает с запасом, а перебор становится
# бессмысленным. Ключ — IP, но в зале он общий: для гостей эта ручка не нужна,
# поэтому помешать друг другу они не могут.
RATE_LIMIT_LOGIN = 10  # POST /api/auth/login
# Занятие номера. В зале весь Wi-Fi под одним адресом, но занимает номер каждый
# гость ровно один раз — десяти в минуту на весь зал хватает. Скрипту, метящему
# забрать день целиком, этого мало: 200 номеров растянутся на 20 минут, а
# незанятые кассой номера к тому времени начнут протухать.
RATE_LIMIT_CLAIM = 10  # POST /api/guest/claim
# С какого числа занятых за день номеров одним устройством слать алерт.
CLAIM_ALERT_AT = 3
_rate_hits: dict[str, list[float]] = {}

# Фоновые отправки уведомлений: держим ссылки, иначе сборщик мусора может
# убить задачу до того, как она дойдёт до сети.
_bg_tasks: set[asyncio.Task] = set()


def _fire(coro) -> None:
    """Отправить уведомление в фоне — гость не должен ждать Telegram.

    Вызывать только из `async def`-ручки: синхронная выполняется в пуле потоков,
    где нет запущенного event loop, и create_task падает с RuntimeError — то
    есть вместо уведомления пользователь получает 500.
    """
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


def _trusted_peer(host: str) -> bool:
    """Пришёл ли запрос из внутренней сети, то есть от нашего Caddy.

    В проде у контейнера нет опубликованных портов: снаружи до приложения
    доходит только то, что пропустил Caddy, а он всегда виден как приватный
    адрес docker-сети. Публичный адрес в этом поле означает, что прокси в цепочке
    нет, — и верить заголовкам такого клиента нельзя.
    """
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback


def _client_ip(request: Request) -> str:
    """IP гостя — ключ для всех лимитов по адресу.

    Caddy дописывает адрес соединения в КОНЕЦ X-Forwarded-For, сохраняя всё, что
    прислал клиент. Поэтому первый элемент — это то, что напечатал сам клиент:
    брать его нельзя, иначе любой лимит (включая десять попыток пароля) обходится
    одной строкой в curl — счётчик каждый раз заводится на выдуманный адрес.

    Но и последний элемент годится только когда заголовок вообще проставил наш
    прокси. Если запрос пришёл напрямую, весь заголовок сочинил клиент, и
    «последний» ничем не лучше первого — тогда считаем по адресу соединения.

    Чтобы это работало, uvicorn запускается с --no-proxy-headers: иначе он сам
    перепишет client.host по тому же заголовку, и проверять будет уже нечего.
    """
    peer = request.client.host if request.client else ""
    xff = request.headers.get("x-forwarded-for", "")
    if xff and _trusted_peer(peer):
        return xff.split(",")[-1].strip()
    return peer or "unknown"


def _own_url(request: Request, data: str) -> str:
    """Пропустить только адрес этого же сайта. Иначе 400.

    Принимаем относительный путь («/board») и полный http(s)-адрес на том же
    хосте. Хост берём из запроса: снаружи до приложения доходят только домены,
    которые Caddy для него и маршрутизирует.
    """
    value = (data or "").strip()
    if value.startswith("/") and not value.startswith("//"):
        return str(request.base_url).rstrip("/") + value
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https") and parsed.hostname == request.url.hostname:
        return value
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="QR генерится только для страниц этого сайта",
    )


def _rate_ok(key: str, limit: int) -> bool:
    """Не больше `limit` обращений в минуту по этому ключу."""
    now = time.monotonic()
    hits = [t for t in _rate_hits.get(key, []) if now - t < RATE_LIMIT_WINDOW]
    if len(hits) >= limit:
        _rate_hits[key] = hits
        return False
    hits.append(now)
    _rate_hits[key] = hits
    # Словарь не должен расти вечно: изредка выметаем остывшие адреса.
    if len(_rate_hits) > 512:
        for k in [k for k, v in _rate_hits.items()
                  if not v or now - v[-1] > RATE_LIMIT_WINDOW]:
            _rate_hits.pop(k, None)
    return True


def _guard(request: Request, limit: int = RATE_LIMIT_WRITE, kind: str = "w") -> None:
    """Лимит по IP. `kind` — своя корзина на каждый вид обращения.

    Вид передаётся явно, а не выводится из числа: два разных лимита легко
    оказываются равны (вход и занятие номера — оба по десять), и тогда они
    молча делят один счётчик, а гость выбивает персоналу вход.
    """
    ip = _client_ip(request)
    if not _rate_ok(f"{kind}:{ip}", limit):
        db.log_security("rate_limited", ip, bucket=kind, path=request.url.path)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов, попробуйте через минуту",
        )


def _ua_hash(request: Request) -> str:
    """Хэш User-Agent + IP — грубая метка отправителя для разбора накруток.
    Сам IP не храним: для антиспама хватает того, что метка совпадает."""
    raw = request.headers.get("user-agent", "") + "|" + _client_ip(request)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _with_text(result: dict) -> dict:
    """Добавить к ответу текст отказа для гостя."""
    reason = result.get("reason")
    return {**result, "message": REASON_TEXT.get(reason, "")} if reason else result


def _review_links() -> dict:
    """Ссылки на карты и соцсети. Пустые в .env не отдаём — кнопки не рисуются."""
    links = {
        "yandex": settings.review_url_yandex,
        "2gis": settings.review_url_2gis,
        "telegram": settings.social_url_telegram,
        "vk": settings.social_url_vk,
        "instagram": settings.social_url_instagram,
    }
    return {k: v for k, v in links.items() if v}


@app.get("/api/feedback/config")
def feedback_config() -> dict:
    """Настройки воронки для фронта: пауза до экрана оценки и ссылки на отзывы.
    Гостевая ручка — дёргается один раз при заходе на /board."""
    return {
        "promptDelaySec": settings.feedback_prompt_delay_sec,
        "links": _review_links(),
    }


class GuestStepBody(BaseModel):
    step: str = Field(max_length=40)
    # Случайная метка визита с фронта: нужна, чтобы считать людей, а не клики.
    # Живёт до закрытия вкладки.
    session: str = Field(default="", max_length=40)
    # Заказ, за которым гость следит (если уже подписан). Связывает поведение с
    # временами готовки — ради этого разреза номер и собираем.
    number: int | None = Field(default=None, gt=0, le=100000)
    # Метка устройства из localStorage: отличает вернувшегося гостя от нового.
    # Случайная строка, не выводится ни из IP, ни из User-Agent.
    guest: str = Field(default="", max_length=40)


@app.post("/api/guest/event")
def guest_event(request: Request, body: GuestStepBody) -> dict:
    """Шаг гостя по воронке (аноним, для аналитики).

    Тихая ручка: неизвестный шаг просто не пишется, ошибку гостю не показываем —
    сбор статистики не должен мешать человеку забрать заказ.
    """
    _guard(request, RATE_LIMIT_STEP, "s")
    return {
        "ok": db.log_guest_event(body.step, body.session, body.number, body.guest)
    }


@app.get("/api/stats/guest")
def stats_guest(
    dates: str = Query(default=""),
    _: dict = Depends(require_staff),
) -> dict:
    """Воронка гостя за выбранные дни: сколько визитов дошло до каждого шага."""
    valid = [d for d in dates.split(",") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)]
    if not valid:
        valid = [db.today()]
    return {
        "dates": valid,
        **db.guest_funnel(valid),
        **db.guest_by_wait(valid),
        "returning": db.guest_returning(valid),
    }


@app.get("/api/feedback/check")
def feedback_check(
    request: Request,
    number: int = Query(gt=0, le=100000),
) -> dict:
    """Можно ли оценить этот заказ — гость вводит номер с чека руками.

    Внутренний `orderId` наружу не отдаём: он сквозной по всей истории, и по его
    приросту любой желающий считал бы оборот точки.
    """
    _guard(request, RATE_LIMIT_READ, "r")
    result = db.feedback_check(number)
    return _with_text({k: v for k, v in result.items() if k != "orderId"})


class ClaimBody(BaseModel):
    number: int = Field(gt=0, le=100000)
    # Метка устройства из localStorage. По ней узнаём вернувшегося гостя и
    # считаем, сколько номеров он уже занял.
    guest: str = Field(default="", max_length=40)


@app.post("/api/guest/claim")
async def guest_claim(request: Request, body: ClaimBody) -> dict:
    """Занять номер заказа за этим телефоном и получить ключ для отзыва.

    Номер с чека совпадает с номером на телевизоре — сам по себе он ничего не
    подтверждает. Поэтому право на отзыв достаётся тому, кто вбил номер первым:
    гость делает это сразу после оплаты, а оценка открывается только после
    выдачи, через десяток минут готовки.
    """
    _guard(request, RATE_LIMIT_CLAIM, "c")
    result = db.claim_order(body.number, guest=body.guest)
    if not result["ok"]:
        db.log_security(
            "claim_taken" if result["reason"] == "taken" else "claim_too_many",
            _client_ip(request), number=body.number, guest=body.guest[:40],
        )
        return _with_text(result)
    # Одно устройство, гребущее номера пачкой, — это попытка оставить зал без
    # отзывов. Порог ниже дневного лимита: важно увидеть это до того, как упрётся.
    if body.guest and db.claims_today(body.guest) >= CLAIM_ALERT_AT:
        _fire(notify.notify_claim_anomaly(
            body.guest, db.claims_today(body.guest), _client_ip(request)
        ))
    return result


class FeedbackBody(BaseModel):
    number: int = Field(gt=0, le=100000)
    rating: int = Field(ge=1, le=5)
    # Ключ, выданный при занятии номера: без него оценку за этот заказ не принять.
    claim_token: str = Field(default="", max_length=64)


@app.post("/api/feedback")
async def feedback_create(request: Request, body: FeedbackBody) -> dict:
    """Сохранить оценку (первый тап по звёздам) и увести гостя в нужную ветку.

    Уведомление уходит сразу, в фоне: гость может закрыть вкладку, не дописав
    деталей, а негатив надо увидеть, пока он ещё у окна.
    """
    _guard(request)
    result = db.feedback_create(
        body.number, body.rating,
        claim_token=body.claim_token, ua_hash=_ua_hash(request),
    )
    if not result["ok"]:
        if result["reason"] == "not_claimed":
            db.log_security("feedback_denied", _client_ip(request),
                            number=body.number, rating=body.rating)
        return _with_text(result)
    _fire(notify.notify_feedback(result, result["branch"]))
    return {**result, "links": _review_links() if result["branch"] == "positive" else {}}


class FeedbackRateBody(BaseModel):
    feedback_id: int = Field(gt=0)
    edit_token: str = Field(default="", max_length=64)
    rating: int = Field(ge=1, le=5)


@app.post("/api/feedback/rate")
async def feedback_rate(request: Request, body: FeedbackRateBody) -> dict:
    """Исправить уже поставленную оценку — гость мог промахнуться по звезде.

    Уведомление об этом уходит отдельно: первое сообщение уже у владельца, и
    он должен знать, что двойка превратилась в пятёрку (или наоборот).
    """
    _guard(request)
    try:
        result = db.feedback_rate(body.feedback_id, body.edit_token, body.rating)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not result["ok"]:
        return _with_text(result)
    if result["changed"]:
        _fire(notify.notify_feedback_changed(result["feedback"], result["was"]))
    return {
        "ok": True,
        "branch": result["branch"],
        "links": _review_links() if result["branch"] == "positive" else {},
    }


class FeedbackDetailBody(BaseModel):
    feedback_id: int = Field(gt=0)
    # Ключ из ответа POST /api/feedback: без него чужой отзыв не переписать.
    edit_token: str = Field(default="", max_length=64)
    tags: list[str] = Field(default_factory=list, max_length=12)
    comment: str = Field(default="", max_length=1000)
    contact: str = Field(default="", max_length=120)


@app.post("/api/feedback/detail")
async def feedback_detail(request: Request, body: FeedbackDetailBody) -> dict:
    """Дописать детали к оценке: теги, текст, контакт. Всё необязательно."""
    _guard(request)
    tags = ",".join(t.strip()[:40] for t in body.tags if t.strip())[:300]
    result = db.feedback_detail(
        body.feedback_id, edit_token=body.edit_token,
        tags=tags, comment=body.comment, contact=body.contact
    )
    if not result["ok"]:
        return _with_text(result)
    fb = result["feedback"]
    # Уведомляем только когда детали появились впервые: повторная отправка той
    # же формы не должна сыпать в чат одинаковые сообщения.
    if result.get("first"):
        _fire(notify.notify_feedback_detail(fb, db.feedback_branch(fb["rating"])))
    return {"ok": True}


@app.get("/api/feedback/list")
def feedback_list(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    fb_status: str | None = Query(default=None, alias="status"),
    _: dict = Depends(require_staff),
) -> dict:
    """Инбокс отзывов за день (по умолчанию сегодня), фильтр по статусу — для кассы."""
    day = date or db.today()
    if fb_status and fb_status not in db.FEEDBACK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неизвестный статус отзыва: {fb_status}",
        )
    return {"date": day, "feedbacks": db.feedback_list(day, fb_status), "now": db.now_hm()}


class FeedbackStatusBody(BaseModel):
    feedback_id: int = Field(gt=0)
    status: str
    staff_note: str = Field(default="", max_length=1000)


@app.post("/api/feedback/status")
def feedback_status(
    body: FeedbackStatusBody, _: dict = Depends(require_staff)
) -> dict:
    """Сменить статус отработки отзыва и оставить заметку — для кассы."""
    try:
        result = db.feedback_set_status(body.feedback_id, body.status, body.staff_note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not result["ok"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Отзыв не найден"
        )
    return result


@app.get("/api/stats/feedback")
def stats_feedback(
    dates: str = Query(default=""),
    _: dict = Depends(require_staff),
) -> dict:
    """Агрегаты по отзывам за выбранные дни (средняя, доля 5★, охват, теги,
    связка «ожидание ↔ оценка»). `dates` — через запятую, пустой — сегодня."""
    valid = [d for d in dates.split(",") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)]
    if not valid:
        valid = [db.today()]
    return {"dates": valid, **db.feedback_stats(valid)}


@app.get("/api/security/events")
def security_events(
    kinds: str = Query(default=""),
    since: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    limit: int = Query(default=200, ge=1, le=2000),
    _: dict = Depends(require_staff),
) -> dict:
    """Журнал событий безопасности — для владельца.

    `kinds` — виды через запятую (login_failed, feedback_denied, …),
    `since` — с какой даты. Свежие сверху.
    """
    wanted = [k for k in kinds.split(",") if k.strip()]
    return {"events": db.security_events(wanted or None, since=since, limit=limit)}


@app.get("/api/security/summary")
def security_summary(
    since: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _: dict = Depends(require_staff),
) -> dict:
    """Сводка по событиям: сколько каких и самые активные адреса."""
    return db.security_summary(since=since)


# --- Статика фронта (после API, чтобы не перехватывать /api/*) ---
if FRONTEND_DIR.exists():

    @app.get("/")
    def index() -> FileResponse:
        """Лендинг-мультиссылка (главная)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/board")
    def board() -> FileResponse:
        """Табло заказов — скрытая вкладка (ссылок с лендинга нет)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/tv")
    def tv() -> FileResponse:
        """ТВ-режим табло — крупная раскладка для телевизора в зале (для персонала)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/staff")
    def staff() -> FileResponse:
        """Экран кассы — заносить заказы и двигать их статусы."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/stats")
    def stats() -> FileResponse:
        """Аналитика по дням/часам — под паролем кассы (для персонала)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
