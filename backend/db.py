"""SQLite-хранилище состояния партий (stdlib sqlite3, без ORM — таблица одна).

Состояние ведётся по дню ресторана. `day_state` хранит по одной строке на дату:
готовых партий, всего партий, время старта, интервал. `batch_log` — журнал
действий кассы (для истории/разбора, не критичен).
"""

import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

from config import settings


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS day_state (
                date          TEXT PRIMARY KEY,
                ready_batch   INTEGER NOT NULL DEFAULT 0,
                total_batches INTEGER NOT NULL,
                start_time    TEXT    NOT NULL,
                interval_min  INTEGER NOT NULL,
                sold_out      INTEGER NOT NULL DEFAULT 0,
                updated_at    TEXT    NOT NULL
            )
            """
        )
        # Миграция для БД, созданных до появления sold_out.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(day_state)")]
        if "sold_out" not in cols:
            conn.execute(
                "ALTER TABLE day_state ADD COLUMN sold_out "
                "INTEGER NOT NULL DEFAULT 0"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS batch_log (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                date    TEXT NOT NULL,
                action  TEXT NOT NULL,
                value   INTEGER,
                at      TEXT NOT NULL
            )
            """
        )


def today() -> str:
    """Текущая дата в часовом поясе ресторана (YYYY-MM-DD)."""
    return datetime.now(ZoneInfo(settings.timezone)).date().isoformat()


def _now() -> str:
    return datetime.now(ZoneInfo(settings.timezone)).isoformat(timespec="seconds")


def now_hm() -> str:
    """Текущее время в часовом поясе ресторана как HH:MM (для сравнения с
    временем старта на фронте — по серверу, не по телефону гостя)."""
    return datetime.now(ZoneInfo(settings.timezone)).strftime("%H:%M")


def get_state(date: str | None = None) -> dict:
    """Состояние на дату (по умолчанию сегодня). Строку дня создаёт при первом
    обращении — с дефолтами из настроек."""
    date = date or today()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM day_state WHERE date = ?", (date,)
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO day_state
                    (date, ready_batch, total_batches, start_time,
                     interval_min, updated_at)
                VALUES (?, 0, ?, ?, ?, ?)
                """,
                (
                    date,
                    settings.default_total_batches,
                    settings.default_start_time,
                    settings.default_interval_min,
                    _now(),
                ),
            )
            row = conn.execute(
                "SELECT * FROM day_state WHERE date = ?", (date,)
            ).fetchone()
    return dict(row)


def _log(conn: sqlite3.Connection, date: str, action: str, value: int) -> None:
    conn.execute(
        "INSERT INTO batch_log (date, action, value, at) VALUES (?, ?, ?, ?)",
        (date, action, value, _now()),
    )


def mark_ready() -> dict:
    """+1 к готовым партиям (не выше total_batches)."""
    date = today()
    get_state(date)  # гарантируем строку
    with _connect() as conn:
        conn.execute(
            """
            UPDATE day_state
               SET ready_batch = MIN(ready_batch + 1, total_batches),
                   updated_at = ?
             WHERE date = ?
            """,
            (_now(), date),
        )
        _log(conn, date, "ready", 1)
    return get_state(date)


def undo_ready() -> dict:
    """−1 к готовым партиям (не ниже 0)."""
    date = today()
    get_state(date)
    with _connect() as conn:
        conn.execute(
            """
            UPDATE day_state
               SET ready_batch = MAX(ready_batch - 1, 0),
                   updated_at = ?
             WHERE date = ?
            """,
            (_now(), date),
        )
        _log(conn, date, "undo", -1)
    return get_state(date)


def reset_day() -> dict:
    """Обнулить готовые партии сегодня и снять стоп продаж (новый день / сброс)."""
    date = today()
    get_state(date)
    with _connect() as conn:
        conn.execute(
            "UPDATE day_state SET ready_batch = 0, sold_out = 0, "
            "updated_at = ? WHERE date = ?",
            (_now(), date),
        )
        _log(conn, date, "reset", 0)
    return get_state(date)


def set_sold_out(flag: bool) -> dict:
    """Стоп продаж на сегодня (True) / открыть продажи снова (False)."""
    date = today()
    get_state(date)
    with _connect() as conn:
        conn.execute(
            "UPDATE day_state SET sold_out = ?, updated_at = ? WHERE date = ?",
            (1 if flag else 0, _now(), date),
        )
        _log(conn, date, "sold_out", 1 if flag else 0)
    return get_state(date)


def update_settings(
    total_batches: int, start_time: str, interval_min: int
) -> dict:
    """Правка параметров дня (всего партий / старт / интервал)."""
    date = today()
    get_state(date)
    with _connect() as conn:
        conn.execute(
            """
            UPDATE day_state
               SET total_batches = ?, start_time = ?, interval_min = ?,
                   updated_at = ?
             WHERE date = ?
            """,
            (total_batches, start_time, interval_min, _now(), date),
        )
        _log(conn, date, "settings", total_batches)
    return get_state(date)
