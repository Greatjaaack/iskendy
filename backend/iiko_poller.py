"""Фоновый поллер заказов из iiko (через внутреннюю ручку аналитики).

Раз в `iiko_poll_seconds` дёргает ручку аналитики со списком сегодняшних заказов
и заводит новые со статусом «open». Свежесть ограничена окном
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
import notify
from config import settings

logger = logging.getLogger("iiko_poller")

# Сколько секунд подряд касса должна молчать, чтобы поднимать тревогу.
#
# Считаем именно время, а не число неудачных тиков. Раньше стояло «пять тиков»
# с комментарием «при опросе раз в 30 секунд это две с половиной минуты», но на
# проде опрос идёт раз в 10 секунд — то есть тревога уходила через 50 секунд,
# втрое раньше задуманного. Порог, привязанный к числу попыток, тихо меняет
# смысл при каждой правке периода опроса.
#
# Три минуты выбраны так: у аналитики бывают короткие обрывы связи с iiko, и
# почти все они проходят сами (93% её сбоев приходятся на рабочие часы и
# длятся секунды). Тревожить смену на каждом таком эпизоде — верный способ
# приучить её не читать сообщения. Настоящая поломка длиннее трёх минут.
ALERT_AFTER_SEC = 180


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
    # Одиночный таймаут — обычное дело, слать по нему сообщение нельзя.
    # Сообщаем, когда молчание длится дольше ALERT_AFTER_SEC.
    fails = 0
    molchit_s = None      # монотонное время начала серии неудач
    announced = False
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await _poll_once(client)
                if announced:
                    await notify.notify_poller_back()
                    logger.info("iiko: связь восстановилась после %d неудач", fails)
                fails, molchit_s, announced = 0, None, False
            except Exception as exc:  # noqa: BLE001 — best-effort, тик не должен ронять луп
                fails += 1
                if molchit_s is None:
                    molchit_s = time.monotonic()
                molchit = time.monotonic() - molchit_s
                logger.warning("iiko-поллер: тик пропущен (%d подряд, %d с): %s",
                               fails, round(molchit), exc)
                if molchit >= ALERT_AFTER_SEC and not announced:
                    announced = True
                    await notify.notify_poller_down(fails, f"{type(exc).__name__}: {exc}")
            await asyncio.sleep(settings.iiko_poll_seconds)
