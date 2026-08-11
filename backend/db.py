"""SQLite-хранилище заказов «Искенди» (stdlib sqlite3, без ORM).

Модель — пер-заказный трекинг статусов. Каждый заказ ведётся по дню ресторана:
кассир заносит номер (с чека) → статус «готовится» → «готово» → «выдано».
Выданные заказы уходят с табло. Одна таблица `orders`.
"""

import hmac
import logging
import re
import secrets
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

from config import settings

# Журнал событий заказов (создание/смена статуса/удаление) — в логи и в БД.
audit = logging.getLogger("orders")

# Разрешённые статусы и их порядок:
# open (открытый — приехал из iiko, ещё не взяли в работу) → preparing (готовится)
# → ready (готово) → served (выдано). «served» снимает заказ с табло.
STATUSES = ("open", "preparing", "ready", "served")
# Статусы активных заказов (в панели кассы). Гостю на табло показываем только
# preparing/ready (см. фронт) — «открытые» видит лишь касса.
ACTIVE_STATUSES = ("open", "preparing", "ready")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                date       TEXT    NOT NULL,
                number     INTEGER NOT NULL,
                status     TEXT    NOT NULL DEFAULT 'preparing',
                created_at TEXT    NOT NULL,
                updated_at TEXT    NOT NULL,
                ready_at   TEXT,
                served_at  TEXT,
                source     TEXT    NOT NULL DEFAULT 'manual'
            )
            """
        )
        # Поиск активного заказа по дню и номеру — самый частый запрос.
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_orders_date_status "
            "ON orders (date, status)"
        )
        # Миграции БД, созданных раньше. created_at = время приёма, ready_at =
        # готово, served_at = выдано; source = откуда заказ (manual/iiko).
        cols = [r[1] for r in conn.execute("PRAGMA table_info(orders)")]
        for col in ("ready_at", "served_at"):
            if col not in cols:
                conn.execute(f"ALTER TABLE orders ADD COLUMN {col} TEXT")
        if "source" not in cols:
            conn.execute(
                "ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
            )
        # Журнал событий заказов (аудит): создание, смена статуса, удаление, сброс.
        # Переживает передеплой (в отличие от docker logs) — история по дням.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS order_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                date        TEXT    NOT NULL,
                number      INTEGER,
                event       TEXT    NOT NULL,
                from_status TEXT,
                to_status   TEXT,
                source      TEXT,
                at          TEXT    NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_date ON order_events (date)"
        )
        # Отзывы гостей (docs/feedback-flow.md). Один заказ — один отзыв, правило
        # держит уникальный индекс по order_id, а не аккуратность вызывающего кода.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feedbacks (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                date          TEXT    NOT NULL,
                order_id      INTEGER NOT NULL,
                number        INTEGER NOT NULL,
                rating        INTEGER NOT NULL,
                tags          TEXT,
                comment       TEXT,
                contact       TEXT,
                contact_type  TEXT,
                wait_seconds  INTEGER,
                status        TEXT    NOT NULL DEFAULT 'new',
                staff_note    TEXT,
                created_at    TEXT    NOT NULL,
                updated_at    TEXT    NOT NULL,
                ua_hash       TEXT
            )
            """
        )
        # Ключ на дописывание деталей: выдаётся автору отзыва и без него чужой
        # отзыв не переписать (id-то предсказуемый — они идут подряд).
        fb_cols = [r[1] for r in conn.execute("PRAGMA table_info(feedbacks)")]
        if "edit_token" not in fb_cols:
            conn.execute("ALTER TABLE feedbacks ADD COLUMN edit_token TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_order "
            "ON feedbacks (order_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_feedback_date "
            "ON feedbacks (date, rating)"
        )


def _log_event(
    conn: sqlite3.Connection,
    date: str,
    event: str,
    number: int | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    source: str | None = None,
) -> None:
    """Записать событие заказа в журнал (БД) и в логи (docker logs)."""
    conn.execute(
        """
        INSERT INTO order_events
            (date, number, event, from_status, to_status, source, at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (date, number, event, from_status, to_status, source, _now()),
    )
    if event == "status":
        audit.info("ЗАКАЗ %s: %s → %s", number, from_status, to_status)
    elif event == "created":
        audit.info("ЗАКАЗ %s: создан (%s, %s)", number, to_status, source)
    elif event == "deleted":
        audit.info("ЗАКАЗ %s: удалён (был %s)", number, from_status)
    elif event == "reset":
        audit.info("СБРОС ДНЯ: убрано активных %s", number)


def today() -> str:
    """Текущая дата в часовом поясе ресторана (YYYY-MM-DD)."""
    return datetime.now(ZoneInfo(settings.timezone)).date().isoformat()


def _now() -> str:
    return datetime.now(ZoneInfo(settings.timezone)).isoformat(timespec="seconds")


def now_hm() -> str:
    """Текущее время ресторана как HH:MM (по серверу, не по телефону гостя)."""
    return datetime.now(ZoneInfo(settings.timezone)).strftime("%H:%M")


def get_board(date: str | None = None) -> dict:
    """Состояние табло на дату (по умолчанию сегодня).

    Возвращает активные заказы (готовится/готово), число выданных за день и
    время последнего изменения. Заказы отсортированы по номеру.
    """
    date = date or today()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT number, status, created_at, ready_at, served_at FROM orders
             WHERE date = ? AND status IN ('open', 'preparing', 'ready')
             ORDER BY number
            """,
            (date,),
        ).fetchall()
        served = conn.execute(
            "SELECT COUNT(*) AS n FROM orders WHERE date = ? AND status = 'served'",
            (date,),
        ).fetchone()["n"]
        upd = conn.execute(
            "SELECT MAX(updated_at) AS m FROM orders WHERE date = ?", (date,)
        ).fetchone()["m"]
    return {
        "date": date,
        "orders": [_order_dict(r) for r in rows],
        "servedCount": served,
        "updatedAt": upd or "",
    }


def _order_dict(row: sqlite3.Row) -> dict:
    """Заказ для API: номер, статус и метки времени статусов.

    acceptedAt — приём (создание), readyAt — готово, servedAt — выдано.
    """
    return {
        "number": row["number"],
        "status": row["status"],
        "acceptedAt": row["created_at"],
        "readyAt": row["ready_at"],
        "servedAt": row["served_at"],
    }


def get_history(date: str | None = None) -> list[dict]:
    """Полная история заказов за день (включая выданные) — для персонала.

    Отсортировано по времени приёма. Содержит метки всех статусов.
    """
    date = date or today()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT number, status, created_at, ready_at, served_at FROM orders
             WHERE date = ? ORDER BY created_at, number
            """,
            (date,),
        ).fetchall()
    return [_order_dict(r) for r in rows]


def _active_id(conn: sqlite3.Connection, date: str, number: int) -> int | None:
    """id активного заказа (open/готовится/готово) с таким номером сегодня, если есть."""
    row = conn.execute(
        """
        SELECT id FROM orders
         WHERE date = ? AND number = ? AND status IN ('open', 'preparing', 'ready')
         ORDER BY id DESC LIMIT 1
        """,
        (date, number),
    ).fetchone()
    return row["id"] if row else None


def add_order(number: int) -> dict:
    """Занести новый заказ (статус «готовится»).

    Если заказ с таким номером уже активен сегодня — ошибка (дубликат).
    """
    date = today()
    with _connect() as conn:
        if _active_id(conn, date, number) is not None:
            raise ValueError(f"Заказ №{number} уже на табло")
        now = _now()
        conn.execute(
            """
            INSERT INTO orders (date, number, status, created_at, updated_at)
            VALUES (?, ?, 'preparing', ?, ?)
            """,
            (date, number, now, now),
        )
        _log_event(conn, date, "created", number, to_status="preparing", source="manual")
    return get_board(date)


def ingest_iiko_order(number: int, opened_at: str | None = None) -> bool:
    """Завести заказ из iiko со статусом «open», если его сегодня ещё нет.

    Дедуп по (дата, номер) в ЛЮБОМ статусе — уже занесённый/продвинутый/выданный
    заказ повторно не создаём. `opened_at` — время открытия из iiko (идёт как
    время приёма). Возвращает True, если заказ создан.
    """
    date = today()
    with _connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM orders WHERE date = ? AND number = ? LIMIT 1",
            (date, number),
        ).fetchone()
        if exists is not None:
            return False
        now = _now()
        conn.execute(
            """
            INSERT INTO orders
                (date, number, status, created_at, updated_at, source)
            VALUES (?, ?, 'open', ?, ?, 'iiko')
            """,
            (date, number, opened_at or now, now),
        )
        _log_event(conn, date, "created", number, to_status="open", source="iiko")
    return True


def set_status(number: int, new_status: str) -> dict:
    """Перевести активный заказ в новый статус (готовится/готово/выдано)."""
    if new_status not in STATUSES:
        raise ValueError(f"Неизвестный статус: {new_status}")
    date = today()
    now = _now()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, status FROM orders
             WHERE date = ? AND number = ? AND status IN ('open', 'preparing', 'ready')
             ORDER BY id DESC LIMIT 1
            """,
            (date, number),
        ).fetchone()
        if row is None:
            raise ValueError(f"Активного заказа №{number} нет")
        oid, old_status = row["id"], row["status"]
        # Метку времени ставим для статуса, в который переходим. Приём
        # (created_at) не трогаем — он фиксирует первое занесение заказа.
        stamp = {"ready": "ready_at", "served": "served_at"}.get(new_status)
        if stamp:
            conn.execute(
                f"UPDATE orders SET status = ?, {stamp} = ?, updated_at = ? "
                "WHERE id = ?",
                (new_status, now, now, oid),
            )
        else:
            conn.execute(
                "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
                (new_status, now, oid),
            )
        _log_event(conn, date, "status", number, from_status=old_status, to_status=new_status)
    return get_board(date)


def delete_order(number: int) -> dict:
    """Удалить активный заказ (ошибочно занесён)."""
    date = today()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, status FROM orders
             WHERE date = ? AND number = ? AND status IN ('open', 'preparing', 'ready')
             ORDER BY id DESC LIMIT 1
            """,
            (date, number),
        ).fetchone()
        if row is None:
            raise ValueError(f"Активного заказа №{number} нет")
        conn.execute("DELETE FROM orders WHERE id = ?", (row["id"],))
        _log_event(conn, date, "deleted", number, from_status=row["status"])
    return get_board(date)


def reset_day() -> dict:
    """Очистить ТАБЛО за сегодня: убрать активные (open/готовится/готово).

    Выданные (served) НЕ трогаем — это история дня, она хранится постоянно
    (для аналитики). Кнопка «Новый день» лишь снимает зависшие активные заказы.
    """
    date = today()
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM orders WHERE date = ? AND status IN "
            "('open', 'preparing', 'ready')",
            (date,),
        )
        _log_event(conn, date, "reset", number=cur.rowcount)
    return get_board(date)


def get_events(date: str | None = None) -> list[dict]:
    """Журнал событий заказов за день (для персонала): что и когда менялось."""
    date = date or today()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT number, event, from_status, to_status, source, at
              FROM order_events WHERE date = ? ORDER BY id
            """,
            (date,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------- Аналитика (операционные метрики по временам статусов) ----------
# created_at = приём, ready_at = готово, served_at = выдано. Метки могут быть с
# tz-сдвигом (ручные) или без (из iiko) — приводим к naive (все в поясе точки).

def _parse_naive(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except ValueError:
        return None


def _avg_sec(values: list[float]) -> int | None:
    return round(sum(values) / len(values)) if values else None


_WEEKDAYS = ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")


def _weekday(date: str) -> str:
    from datetime import date as _date

    try:
        return _WEEKDAYS[_date.fromisoformat(date).weekday()]
    except ValueError:
        return ""


def stats_days() -> list[dict]:
    """Сводка по дням: заказов (всего/выдано) и средние времена этапов (сек).

    prep = приём→готово, wait = готово→выдано, total = приём→выдано.
    """
    from collections import defaultdict

    with _connect() as conn:
        rows = conn.execute(
            "SELECT date, status, created_at, ready_at, served_at FROM orders"
        ).fetchall()

    days: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "served": 0, "prep": [], "wait": [], "full": []}
    )
    for r in rows:
        d = days[r["date"]]
        d["total"] += 1
        if r["status"] == "served":
            d["served"] += 1
        c = _parse_naive(r["created_at"])
        rd = _parse_naive(r["ready_at"])
        sv = _parse_naive(r["served_at"])
        if c and rd and rd >= c:
            d["prep"].append((rd - c).total_seconds())
        if rd and sv and sv >= rd:
            d["wait"].append((sv - rd).total_seconds())
        if c and sv and sv >= c:
            d["full"].append((sv - c).total_seconds())

    out = []
    for date in sorted(days, reverse=True):
        d = days[date]
        out.append(
            {
                "date": date,
                "weekday": _weekday(date),
                "total": d["total"],
                "served": d["served"],
                "avgPrepSec": _avg_sec(d["prep"]),
                "avgWaitSec": _avg_sec(d["wait"]),
                "avgTotalSec": _avg_sec(d["full"]),
            }
        )
    return out


def stats_range(dates: list[str]) -> dict:
    """Сводка + разбивка по часам за ВЫБРАННЫЕ дни (один или несколько).

    summary — совокупные метрики по всем заказам выбранных дней; hours —
    средние времена этапов по часу приёма (объединено по выбранным дням).
    """
    from collections import defaultdict

    empty = {"total": 0, "served": 0, "avgPrepSec": None, "avgWaitSec": None, "avgTotalSec": None}
    if not dates:
        return {"summary": empty, "hours": []}

    placeholders = ",".join("?" * len(dates))
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT status, created_at, ready_at, served_at FROM orders "
            f"WHERE date IN ({placeholders})",
            dates,
        ).fetchall()

    total = served = 0
    prep: list[float] = []
    wait: list[float] = []
    full: list[float] = []
    hours: dict[int, dict] = defaultdict(lambda: {"count": 0, "prep": [], "wait": []})
    for r in rows:
        total += 1
        if r["status"] == "served":
            served += 1
        c = _parse_naive(r["created_at"])
        rd = _parse_naive(r["ready_at"])
        sv = _parse_naive(r["served_at"])
        if c and rd and rd >= c:
            prep.append((rd - c).total_seconds())
        if rd and sv and sv >= rd:
            wait.append((sv - rd).total_seconds())
        if c and sv and sv >= c:
            full.append((sv - c).total_seconds())
        if c:
            h = hours[c.hour]
            h["count"] += 1
            if rd and rd >= c:
                h["prep"].append((rd - c).total_seconds())
            if rd and sv and sv >= rd:
                h["wait"].append((sv - rd).total_seconds())

    return {
        "summary": {
            "total": total,
            "served": served,
            "avgPrepSec": _avg_sec(prep),
            "avgWaitSec": _avg_sec(wait),
            "avgTotalSec": _avg_sec(full),
        },
        "hours": [
            {
                "hour": hr,
                "count": hours[hr]["count"],
                "avgPrepSec": _avg_sec(hours[hr]["prep"]),
                "avgWaitSec": _avg_sec(hours[hr]["wait"]),
            }
            for hr in sorted(hours)
        ],
    }


# ---------- Путь заказа (сколько он пролежал в каждом статусе) ----------
# В `orders` нет метки перехода open→preparing (штампуются только ready/served),
# поэтому путь собираем из журнала order_events, а метки orders используем как
# опору (приём) и как запасной вариант для заказов старше журнала.

# Сколько заказов отдаём за раз: за месяц их тысячи, а таблица столько не нужна.
ORDERS_PATH_LIMIT = 400


def _event_chains(events: list[sqlite3.Row]) -> list[list[sqlite3.Row]]:
    """Разбить события одного (дата, номер) на цепочки: новая — с каждого `created`.

    Номер за день может быть переиспользован (заказ удалили и завели заново),
    и тогда событий на один номер несколько независимых серий.
    """
    chains: list[list[sqlite3.Row]] = []
    for e in events:
        if e["event"] == "created" or not chains:
            chains.append([])
        chains[-1].append(e)
    return chains


def _pick_chain(chains: list[list[sqlite3.Row]], created: datetime | None) -> list[sqlite3.Row]:
    """Цепочка событий, начавшаяся ближе всего к времени приёма заказа."""
    if not chains:
        return []
    if created is None:
        return chains[-1]

    def gap(chain: list[sqlite3.Row]) -> float:
        at = _parse_naive(chain[0]["at"])
        return abs((at - created).total_seconds()) if at else 1e12

    return min(chains, key=gap)


def _order_path(row: sqlite3.Row, events: list[sqlite3.Row]) -> dict:
    """Путь одного заказа: время в каждом статусе (сек) и метки начала/конца."""
    created = _parse_naive(row["created_at"])
    ready = _parse_naive(row["ready_at"])
    served = _parse_naive(row["served_at"])

    chain = _pick_chain(_event_chains(events), created)
    # Стартовый статус: из журнала, иначе по источнику (iiko заводит «открытый»).
    start = "open" if row["source"] == "iiko" else "preparing"
    if chain and chain[0]["event"] == "created" and chain[0]["to_status"]:
        start = chain[0]["to_status"]

    seq: list[tuple[str, datetime]] = []
    if created:
        seq.append((start, created))
    for e in chain:
        at = _parse_naive(e["at"])
        if e["event"] != "status" or not e["to_status"] or at is None:
            continue
        # Приём из iiko — время открытия чека, оно может опережать журнал.
        seq.append((e["to_status"], max(at, created) if created else at))
    # Заказы старше журнала: переходы достаём из меток orders.
    logged = {st for st, _ in seq[1:]}
    if ready and "ready" not in logged:
        seq.append(("ready", ready))
    if served and "served" not in logged:
        seq.append(("served", served))
    seq.sort(key=lambda p: p[1])

    spent = {"open": 0, "preparing": 0, "ready": 0}
    for (st, at), (_, nxt) in zip(seq, seq[1:]):
        if st in spent and nxt > at:
            spent[st] += round((nxt - at).total_seconds())

    done = row["status"] == "served" and served is not None
    # Лента переходов: во сколько заказ попал в каждый статус и сколько там
    # пролежал. Без неё в карточке видны только приём и выдача, а вопрос
    # «когда именно он стал готов» остаётся без ответа.
    timeline = []
    for i, (st, at) in enumerate(seq):
        nxt = seq[i + 1][1] if i + 1 < len(seq) else None
        timeline.append({
            "status": st,
            "at": at.isoformat(timespec="seconds"),
            "sec": round((nxt - at).total_seconds()) if nxt and nxt > at else None,
        })
    return {
        "timeline": timeline,
        "date": row["date"],
        "number": row["number"],
        "status": row["status"],
        "source": row["source"],
        "acceptedAt": row["created_at"],
        "doneAt": row["served_at"],
        "openSec": spent["open"],
        "prepSec": spent["preparing"],
        "readySec": spent["ready"],
        "totalSec": round((served - created).total_seconds()) if done and created else None,
    }


def stats_orders(dates: list[str], limit: int = ORDERS_PATH_LIMIT) -> dict:
    """Путь каждого заказа за выбранные дни: время в статусах, приём и выдача.

    Отсортировано новыми вперёд и обрезано до `limit` — при обрезке в ответе
    `truncated`, чтобы фронт честно сказал, что показана не вся выборка.
    """
    from collections import defaultdict

    if not dates:
        return {"orders": [], "total": 0, "truncated": False}

    placeholders = ",".join("?" * len(dates))
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT id, date, number, status, source, created_at, ready_at, served_at "
            f"FROM orders WHERE date IN ({placeholders}) "
            f"ORDER BY date DESC, created_at DESC, number DESC",
            dates,
        ).fetchall()
        # Отзывы к этим же заказам. Связываем по order_id, а не по номеру: за
        # день номер может повториться, и оценка прилипла бы к чужому заказу.
        fb_rows = conn.execute(
            f"SELECT order_id, rating, tags, comment, contact, contact_type, status "
            f"FROM feedbacks WHERE date IN ({placeholders})",
            dates,
        ).fetchall()
        events = conn.execute(
            f"SELECT date, number, event, to_status, at FROM order_events "
            f"WHERE date IN ({placeholders}) AND event IN ('created', 'status') "
            f"ORDER BY id",
            dates,
        ).fetchall()

    by_order: dict[tuple[str, int], list[sqlite3.Row]] = defaultdict(list)
    for e in events:
        if e["number"] is not None:
            by_order[(e["date"], e["number"])].append(e)

    by_fb = {f["order_id"]: f for f in fb_rows}

    limit = max(1, min(limit, 2000))
    shown = rows[:limit]
    out = []
    for r in shown:
        item = _order_path(r, by_order.get((r["date"], r["number"]), []))
        fb = by_fb.get(r["id"])
        # Оценка прямо в строке заказа: видно, сколько гость ждал и как это
        # сказалось на оценке, без сопоставления двух таблиц глазами.
        item["rating"] = fb["rating"] if fb else None
        item["tags"] = [t for t in (fb["tags"] or "").split(",") if t] if fb else []
        item["comment"] = (fb["comment"] if fb else None) or None
        item["contact"] = (fb["contact"] if fb else None) or None
        item["contactType"] = fb["contact_type"] if fb else None
        item["feedbackStatus"] = fb["status"] if fb else None
        out.append(item)
    return {
        "orders": out,
        "total": len(rows),
        "rated": sum(1 for r in rows if r["id"] in by_fb),
        "truncated": len(rows) > limit,
    }


# ---------------------- Отзывы гостей (docs/feedback-flow.md) ----------------
# Оценку гость ставит одним тапом (feedback_create), детали дописываются вторым
# запросом (feedback_detail) — если гость бросит форму, оценка уже в базе.
# Причины отказа возвращаются кодом в поле `reason`, тексты для гостя живут в
# main.py: формулировки правятся в одном месте.

FEEDBACK_STATUSES = ("new", "contacted", "resolved", "visited")
# Окно, в течение которого к отзыву можно дописать детали и переставить оценку.
# Настраивается в .env (feedback_edit_window_min).


def _wait_seconds(row: sqlite3.Row) -> int | None:
    """Фактическое ожидание гостя: приём → выдача, в секундах."""
    c = _parse_naive(row["created_at"])
    sv = _parse_naive(row["served_at"])
    if c and sv and sv >= c:
        return round((sv - c).total_seconds())
    return None


def _contact_type(contact: str | None) -> str | None:
    """Телеграм или телефон — определяем по виду строки, гостя не спрашиваем.

    Ник часто пишут без «собаки» («greatjaaack»), и такой контакт раньше
    оставался без типа: в чат он уходил простым текстом, а в кассе по нему
    нельзя было кликнуть. Считаем телеграмом всё, что выглядит как username.
    """
    c = (contact or "").strip()
    if not c:
        return None
    if c.startswith("@") or "t.me/" in c.lower():
        return "telegram"
    digits = sum(ch.isdigit() for ch in c)
    if digits >= 7:
        return "phone"
    # Username в Telegram: латиница, цифры и подчёркивания, 5–32 символа.
    bare = c.lstrip("@")
    if 5 <= len(bare) <= 32 and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", bare):
        return "telegram"
    return None


def _today_order(conn: sqlite3.Connection, date: str, number: int) -> sqlite3.Row | None:
    """Заказ с таким номером за день. Если номер за день переиспользовали —
    берём последний: отзыв ставят сразу после выдачи, значит про свежий заказ."""
    return conn.execute(
        """
        SELECT id, number, status, created_at, served_at FROM orders
         WHERE date = ? AND number = ? ORDER BY id DESC LIMIT 1
        """,
        (date, number),
    ).fetchone()


def _can_rate(conn: sqlite3.Connection, date: str, number: int) -> dict:
    """Можно ли оценить заказ №number за сегодня.

    Отказы: not_found (нет такого за сегодня — в т.ч. вчерашний номер),
    not_served (ещё не выдан), already (отзыв уже есть).
    """
    order = _today_order(conn, date, number)
    if order is None:
        return {"ok": False, "reason": "not_found"}
    if order["status"] != "served":
        return {"ok": False, "reason": "not_served", "orderId": order["id"]}
    dup = conn.execute(
        "SELECT 1 FROM feedbacks WHERE order_id = ? LIMIT 1", (order["id"],)
    ).fetchone()
    if dup is not None:
        return {"ok": False, "reason": "already", "orderId": order["id"]}
    return {
        "ok": True,
        "reason": None,
        "orderId": order["id"],
        "number": order["number"],
        "waitSeconds": _wait_seconds(order),
    }


def feedback_check(number: int) -> dict:
    """Проверка перед показом формы (запасной путь — ввод номера руками)."""
    with _connect() as conn:
        return _can_rate(conn, today(), number)


def feedback_create(number: int, rating: int, ua_hash: str | None = None) -> dict:
    """Сохранить оценку заказа. Возвращает `feedbackId` и ветку воронки.

    `wait_seconds` фиксируем здесь же, а не считаем потом: если заказ позже
    отредактируют, цифра в отзыве не поедет.
    """
    if rating not in (1, 2, 3, 4, 5):
        raise ValueError("Оценка должна быть от 1 до 5")
    date = today()
    with _connect() as conn:
        check = _can_rate(conn, date, number)
        if not check["ok"]:
            return check
        now = _now()
        token = secrets.token_urlsafe(16)
        try:
            cur = conn.execute(
                """
                INSERT INTO feedbacks
                    (date, order_id, number, rating, wait_seconds,
                     status, created_at, updated_at, ua_hash, edit_token)
                VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
                """,
                (
                    date,
                    check["orderId"],
                    number,
                    rating,
                    check["waitSeconds"],
                    now,
                    now,
                    ua_hash,
                    token,
                ),
            )
        except sqlite3.IntegrityError:
            # Два тапа по звёздам одновременно — уникальный индекс отсёк второй.
            return {"ok": False, "reason": "already", "orderId": check["orderId"]}
        audit.info("ОТЗЫВ №%s: оценка %s", number, rating)
        return {
            "ok": True,
            "feedbackId": cur.lastrowid,
            "editToken": token,
            "branch": feedback_branch(rating),
            "number": number,
            "rating": rating,
            "waitSeconds": check["waitSeconds"],
        }


def feedback_branch(rating: int) -> str:
    """Куда ведём гостя: positive — на карты, negative — во внутреннюю форму."""
    return "negative" if rating <= settings.feedback_negative_max else "positive"


def feedback_detail(
    feedback_id: int,
    edit_token: str = "",
    tags: str | None = None,
    comment: str | None = None,
    contact: str | None = None,
) -> dict:
    """Дописать детали к уже сохранённой оценке (второй запрос воронки).

    Принимаем только свежий отзыв (окно feedback_edit_window_min) и только от
    автора — по ключу, выданному при оценке. Возвращает полную запись: из неё
    main.py собирает алерт.
    """
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id = ?", (feedback_id,)
        ).fetchone()
        if row is None:
            # Отдельный код от not_found: там речь про номер заказа, тут — про
            # саму оценку, и гостю нужен другой текст.
            return {"ok": False, "reason": "unknown_feedback"}
        # Сверка в константное время: id предсказуем, ключ — нет. Сравниваем
        # байты: compare_digest не принимает не-ASCII, а прислать могут что угодно.
        expected = row["edit_token"] or ""
        if not expected or not hmac.compare_digest(
            str(edit_token).encode("utf-8"), expected.encode("utf-8")
        ):
            return {"ok": False, "reason": "wrong_token"}
        created = _parse_naive(row["created_at"])
        age_min = None
        if created:
            now_naive = datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None)
            age_min = (now_naive - created).total_seconds() / 60
        if age_min is None or age_min > settings.feedback_edit_window_min:
            return {"ok": False, "reason": "expired"}
        # Пустое поле = «не менять», а не «стереть». Иначе повторный запрос
        # (ретрай сети, второй тап) затёр бы уже записанный отзыв пустотой.
        tags = (tags or "").strip() or row["tags"]
        comment = (comment or "").strip() or row["comment"]
        had_details = bool(row["tags"] or row["comment"] or row["contact"])
        contact = (contact or "").strip() or row["contact"]
        conn.execute(
            """
            UPDATE feedbacks
               SET tags = ?, comment = ?, contact = ?, contact_type = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            (tags, comment, contact, _contact_type(contact), _now(), feedback_id),
        )
        fresh = conn.execute(
            "SELECT * FROM feedbacks WHERE id = ?", (feedback_id,)
        ).fetchone()
        audit.info(
            "ОТЗЫВ №%s: детали (теги: %s, контакт: %s)",
            fresh["number"],
            fresh["tags"] or "—",
            "есть" if fresh["contact"] else "нет",
        )
        return {"ok": True, "first": not had_details, "feedback": _feedback_dict(fresh)}


def feedback_rate(feedback_id: int, edit_token: str, rating: int) -> dict:
    """Исправить оценку — гость мог промахнуться по звезде.

    Разрешено в том же окне, что и дописывание деталей, и только автору (по
    ключу). Возвращает старую и новую оценку: по ним main.py решает, надо ли
    поправить уже улетевшее уведомление.
    """
    if rating not in (1, 2, 3, 4, 5):
        raise ValueError("Оценка должна быть от 1 до 5")
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id = ?", (feedback_id,)
        ).fetchone()
        if row is None:
            return {"ok": False, "reason": "unknown_feedback"}
        expected = row["edit_token"] or ""
        if not expected or not hmac.compare_digest(
            str(edit_token).encode("utf-8"), expected.encode("utf-8")
        ):
            return {"ok": False, "reason": "wrong_token"}
        created = _parse_naive(row["created_at"])
        if created is None:
            return {"ok": False, "reason": "expired"}
        now_naive = datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None)
        if (now_naive - created).total_seconds() / 60 > settings.feedback_edit_window_min:
            return {"ok": False, "reason": "expired"}
        # Детали уже отправлены — отзыв закрыт. Иначе получилась бы запись вида
        # «5★ + теги «остыло, долго ждали»», противоречивая и для смены, и для
        # аналитики. Промах по звезде ловится до отправки формы.
        if (row["tags"] or row["comment"] or row["contact"]):
            return {"ok": False, "reason": "locked"}
        was = row["rating"]
        if was == rating:
            return {"ok": True, "changed": False, "was": was,
                    "branch": feedback_branch(rating),
                    "feedback": _feedback_dict(row)}
        conn.execute(
            "UPDATE feedbacks SET rating = ?, updated_at = ? WHERE id = ?",
            (rating, _now(), feedback_id),
        )
        fresh = conn.execute(
            "SELECT * FROM feedbacks WHERE id = ?", (feedback_id,)
        ).fetchone()
        audit.info("ОТЗЫВ №%s: оценка исправлена %s → %s", row["number"], was, rating)
        return {"ok": True, "changed": True, "was": was,
                "branch": feedback_branch(rating),
                "feedback": _feedback_dict(fresh)}


def _feedback_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "date": row["date"],
        "number": row["number"],
        "rating": row["rating"],
        "tags": [t for t in (row["tags"] or "").split(",") if t],
        "comment": row["comment"],
        "contact": row["contact"],
        "contactType": row["contact_type"],
        "waitSeconds": row["wait_seconds"],
        "status": row["status"],
        "staffNote": row["staff_note"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def feedback_list(
    date: str | None = None, status: str | None = None, limit: int = 200
) -> list[dict]:
    """Инбокс отзывов для кассы: за день (по умолчанию сегодня), опционально
    только с нужным статусом. Свежие — сверху."""
    date = date or today()
    sql = "SELECT * FROM feedbacks WHERE date = ?"
    params: list = [date]
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_feedback_dict(r) for r in rows]


def feedback_set_status(
    feedback_id: int, status: str, staff_note: str | None = None
) -> dict:
    """Сменить статус отработки негатива и оставить заметку смены."""
    if status not in FEEDBACK_STATUSES:
        raise ValueError(f"Неизвестный статус отзыва: {status}")
    with _connect() as conn:
        row = conn.execute(
            "SELECT id FROM feedbacks WHERE id = ?", (feedback_id,)
        ).fetchone()
        if row is None:
            return {"ok": False, "reason": "not_found"}
        # Заметку не затираем пустой строкой: статус можно двигать без неё.
        note = (staff_note or "").strip()
        if note:
            conn.execute(
                "UPDATE feedbacks SET status = ?, staff_note = ?, updated_at = ? "
                "WHERE id = ?",
                (status, note, _now(), feedback_id),
            )
        else:
            conn.execute(
                "UPDATE feedbacks SET status = ?, updated_at = ? WHERE id = ?",
                (status, _now(), feedback_id),
            )
        fresh = conn.execute(
            "SELECT * FROM feedbacks WHERE id = ?", (feedback_id,)
        ).fetchone()
    return {"ok": True, "feedback": _feedback_dict(fresh)}


# Корзины ожидания для связки «сколько ждал ↔ как оценил» — главная цифра всей
# затеи: где проходит порог, после которого гость перестаёт быть довольным.
_WAIT_BUCKETS = ((0, 300, "до 5 мин"), (300, 480, "5–8"), (480, 720, "8–12"),
                 (720, None, "12+"))


def feedback_stats(dates: list[str]) -> dict:
    """Агрегаты по отзывам за выбранные дни: средняя, доли, теги, корзины ожидания."""
    from collections import Counter

    empty = {
        "count": 0, "orders": 0, "coverage": None, "avgRating": None,
        "share5": None, "negative": 0, "withContact": 0,
        "byRating": {}, "tags": [], "waitBuckets": [],
    }
    if not dates:
        return empty

    placeholders = ",".join("?" * len(dates))
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT rating, tags, contact, wait_seconds FROM feedbacks "
            f"WHERE date IN ({placeholders})",
            dates,
        ).fetchall()
        orders = conn.execute(
            f"SELECT COUNT(*) AS n FROM orders WHERE date IN ({placeholders}) "
            f"AND status = 'served'",
            dates,
        ).fetchone()["n"]

    if not rows:
        return {**empty, "orders": orders}

    ratings = [r["rating"] for r in rows]
    tags: Counter = Counter()
    for r in rows:
        tags.update(t for t in (r["tags"] or "").split(",") if t)

    buckets = []
    for lo, hi, label in _WAIT_BUCKETS:
        vals = [
            r["rating"] for r in rows
            if r["wait_seconds"] is not None
            and r["wait_seconds"] >= lo
            and (hi is None or r["wait_seconds"] < hi)
        ]
        buckets.append({
            "label": label,
            "count": len(vals),
            "avgRating": round(sum(vals) / len(vals), 2) if vals else None,
        })

    negative_max = settings.feedback_negative_max
    return {
        "count": len(rows),
        "orders": orders,
        "coverage": round(len(rows) / orders * 100) if orders else None,
        "avgRating": round(sum(ratings) / len(ratings), 2),
        "share5": round(ratings.count(5) / len(ratings) * 100),
        "negative": sum(1 for x in ratings if x <= negative_max),
        "withContact": sum(1 for r in rows if r["contact"]),
        "byRating": {str(n): ratings.count(n) for n in (1, 2, 3, 4, 5)},
        "tags": [{"tag": t, "count": c} for t, c in tags.most_common(10)],
        "waitBuckets": buckets,
    }
