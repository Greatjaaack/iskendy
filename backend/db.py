"""SQLite-хранилище заказов «Искенди» (stdlib sqlite3, без ORM).

Модель — пер-заказный трекинг статусов. Каждый заказ ведётся по дню ресторана:
кассир заносит номер (с чека) → статус «готовится» → «готово» → «выдано».
Выданные заказы уходят с табло. Одна таблица `orders`.
"""

import logging
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
