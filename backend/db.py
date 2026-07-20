"""SQLite-хранилище заказов «Искенди» (stdlib sqlite3, без ORM).

Модель — пер-заказный трекинг статусов. Каждый заказ ведётся по дню ресторана:
кассир заносит номер (с чека) → статус «готовится» → «готово» → «выдано».
Выданные заказы уходят с табло. Одна таблица `orders`.
"""

import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

from config import settings

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
    return True


def set_status(number: int, new_status: str) -> dict:
    """Перевести активный заказ в новый статус (готовится/готово/выдано)."""
    if new_status not in STATUSES:
        raise ValueError(f"Неизвестный статус: {new_status}")
    date = today()
    now = _now()
    with _connect() as conn:
        oid = _active_id(conn, date, number)
        if oid is None:
            raise ValueError(f"Активного заказа №{number} нет")
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
    return get_board(date)


def delete_order(number: int) -> dict:
    """Удалить активный заказ (ошибочно занесён)."""
    date = today()
    with _connect() as conn:
        oid = _active_id(conn, date, number)
        if oid is None:
            raise ValueError(f"Активного заказа №{number} нет")
        conn.execute("DELETE FROM orders WHERE id = ?", (oid,))
    return get_board(date)


def reset_day() -> dict:
    """Очистить все заказы за сегодня (новый день / сброс)."""
    date = today()
    with _connect() as conn:
        conn.execute("DELETE FROM orders WHERE date = ?", (date,))
    return get_board(date)
