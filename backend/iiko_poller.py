"""Фоновый поллер заказов из iiko (через внутреннюю ручку аналитики).

Раз в `iiko_poll_seconds` дёргает ручку аналитики со списком сегодняшних заказов
и заводит новые со статусом «open». Свежесть ограничена окном
`iiko_ingest_window_min` — чтобы при старте/перезапуске не залить табло старыми,
уже готовыми заказами. Всё best-effort: аналитика недоступна — пропускаем тик.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

import db
from config import settings

logger = logging.getLogger("iiko_poller")


def _is_fresh(open_time: str, now: datetime, window: timedelta) -> bool:
    """Заказ открыт в окне [now-window; now+2мин] (openTime без tz — в поясе точки)."""
    try:
        t = datetime.fromisoformat(open_time)
    except ValueError:
        return False
    return now - window <= t <= now + timedelta(minutes=2)


async def _poll_once(client: httpx.AsyncClient) -> None:
    r = await client.get(
        settings.iiko_orders_url,
        headers={"X-Internal-Token": settings.iiko_internal_token},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    now = datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None)
    window = timedelta(minutes=settings.iiko_ingest_window_min)
    added = 0
    for o in data.get("orders", []):
        num = o.get("number")
        open_time = o.get("openTime", "")
        if not isinstance(num, int) or not _is_fresh(open_time, now, window):
            continue
        if db.ingest_iiko_order(num, opened_at=open_time):
            added += 1
    if added:
        logger.info("iiko: заведено новых заказов: %d", added)


async def run_poller() -> None:
    if not settings.iiko_orders_url or not settings.iiko_internal_token:
        logger.info("iiko-поллер выключен (URL/токен не заданы)")
        return
    logger.info(
        "iiko-поллер запущен: %s каждые %dс",
        settings.iiko_orders_url,
        settings.iiko_poll_seconds,
    )
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _poll_once(client)
            except Exception as exc:  # noqa: BLE001 — best-effort, тик не должен ронять луп
                logger.warning("iiko-поллер: тик пропущен: %s", exc)
            await asyncio.sleep(settings.iiko_poll_seconds)
