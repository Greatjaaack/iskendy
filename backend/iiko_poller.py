"""Фоновый поллер заказов из iiko (через внутреннюю ручку аналитики).

Раз в `iiko_poll_seconds` дёргает ручку аналитики со списком сегодняшних заказов
и заводит новые со статусом «готовится». Свежесть ограничена окном
`iiko_ingest_window_min` — чтобы при старте/перезапуске не залить табло старыми,
уже готовыми заказами. Всё best-effort: аналитика недоступна — пропускаем тик.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

import db
from config import settings

logger = logging.getLogger("iiko_poller")

# Молчание кассы в чат НЕ сообщаем: об этом сообщает сама касса (решение
# Арслана и Ильдара, 27.08.2026). Наше сообщение только дублировало бы чужое.
#
# История, чтобы её не пришлось выяснять заново. Тревога появилась 23.08.2026
# после того, как 18 августа заказы час не доезжали до табло и знал об этом
# только кассир у стойки. Дальше её дважды чинили: порог перевели с числа тиков
# на время, потом добавили окно устойчивой связи — 27 августа касса не
# оборвалась, а замигала, и одна удача закрывала аварию, из-за чего за утро в
# чат ушло девять сообщений про одну поломку. После чего выяснилось, что вся
# ветка была лишней: канал оповещения смены уже есть, и он не наш.
#
# Отсюда правило на будущее: прежде чем строить оповещение, стоит спросить, не
# сообщает ли об этом кто-то ещё. Молчание поллера по-прежнему видно в логе —
# WARNING с числом неудач подряд и длительностью, этого хватает для разбора.


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
    # Серию неудач считаем не ради тревоги, а ради разбора постфактум: по одной
    # строке «тик пропущен» нельзя отличить рябь от часовой поломки.
    fails = 0
    molchit_s = None      # монотонное время начала серии неудач
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _poll_once(client)
                if fails:
                    logger.info("iiko: связь есть, до этого неудач подряд: %d", fails)
                fails, molchit_s = 0, None
            except Exception as exc:  # noqa: BLE001 — best-effort, тик не должен ронять луп
                fails += 1
                if molchit_s is None:
                    molchit_s = time.monotonic()
                # Тип исключения, а не только текст: у таймаутов httpx текст
                # пустой, и строка обрывалась на двоеточии, ничего не объясняя.
                logger.warning("iiko-поллер: тик пропущен (%d подряд, %d с): %s%s",
                               fails, round(time.monotonic() - molchit_s),
                               type(exc).__name__, f": {exc}" if str(exc) else "")
            await asyncio.sleep(settings.iiko_poll_seconds)
