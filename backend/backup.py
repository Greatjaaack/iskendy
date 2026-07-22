"""Ежедневный локальный бэкап БД.

Раз в день снимает онлайн-копию `iskendy.db` (безопасно на живой БД через
`sqlite3.Connection.backup`), жмёт в gzip и кладёт в `<db_dir>/backups/`
с ротацией (последние `backup_keep` копий). Файл живёт в том же volume,
что и БД, — защищает от порчи данных / ошибочного сброса / бага (можно
откатиться на вчерашний снимок). От смерти сервера защищает выгрузка копии
наружу — см. ручку `/api/backup/latest`.
"""

import asyncio
import gzip
import logging
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from config import settings

logger = logging.getLogger("backup")


def backups_dir() -> Path:
    d = Path(settings.db_path).resolve().parent / "backups"
    d.mkdir(exist_ok=True)
    return d


def _today() -> str:
    return datetime.now(ZoneInfo(settings.timezone)).date().isoformat()


def make_backup() -> Path | None:
    """Снять снимок БД за сегодня (если ещё нет). Возвращает путь или None."""
    d = backups_dir()
    dest = d / f"iskendy-{_today()}.db.gz"
    if dest.exists():
        return None  # за сегодня уже есть
    tmp = d / f".tmp-{_today()}.db"
    src = sqlite3.connect(settings.db_path)
    dst = sqlite3.connect(str(tmp))
    try:
        with dst:
            src.backup(dst)  # согласованный онлайн-бэкап
    finally:
        src.close()
        dst.close()
    with open(tmp, "rb") as f_in, gzip.open(dest, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    tmp.unlink(missing_ok=True)
    _rotate(d, settings.backup_keep)
    logger.info("бэкап БД: %s (%d Б)", dest.name, dest.stat().st_size)
    return dest


def _rotate(d: Path, keep: int) -> None:
    if keep <= 0:
        return
    files = sorted(d.glob("iskendy-*.db.gz"))
    for old in files[:-keep]:
        old.unlink(missing_ok=True)


def latest_backup() -> Path | None:
    files = sorted(backups_dir().glob("iskendy-*.db.gz"))
    return files[-1] if files else None


async def run_backup_loop() -> None:
    """Фон: суточный бэкап ночью (в `backup_night_hour`).

    Проверяем раз в час: если время уже за ночным часом и сегодняшнего снимка
    ещё нет — снимаем. Плюс «bootstrap» при старте: если бэкапов нет вообще,
    делаем первый сразу (чтобы копия существовала, не дожидаясь ночи).
    """
    if not settings.backup_enabled:
        logger.info("бэкап БД выключен")
        return
    logger.info(
        "бэкап БД включён: ночью в %02d:00, хранить последних %d",
        settings.backup_night_hour,
        settings.backup_keep,
    )
    if latest_backup() is None:
        try:
            make_backup()
        except Exception as exc:  # noqa: BLE001
            logger.warning("бэкап БД (стартовый): ошибка: %s", exc)
    while True:
        try:
            hour = datetime.now(ZoneInfo(settings.timezone)).hour
            if hour >= settings.backup_night_hour:
                make_backup()  # создаст, если сегодняшнего ещё нет
        except Exception as exc:  # noqa: BLE001 — бэкап не должен ронять приложение
            logger.warning("бэкап БД: ошибка: %s", exc)
        await asyncio.sleep(3600)
