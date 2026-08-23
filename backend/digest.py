"""Вечерняя сводка одним сообщением в Telegram.

Замысел лежал в конфиге с июля (`TELEGRAM_DIGEST_TARGET`), кода не было.
Смысл — не в новых цифрах: всё это и так считают ручки `/api/stats/*`. Смысл в
том, что за ними надо ходить, а значит кто-то должен вспомнить и захотеть. Итог
дня, который приходит сам, читают все и каждый день.

Что сводка обязана показывать, даже когда это неприятно: охват отзывов. Из
222 заказов за 23.08 оценку оставил один гость — воронка построена, экраны
работают, а отклика нет. В графике такое тонет, в ежедневной строке мозолит глаза.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import db
import notify
from config import settings

logger = logging.getLogger("digest")


def _mmin(seconds: float | None) -> str:
    """Секунды → «19 мин». Для итога дня десятые доли не нужны."""
    if seconds is None:
        return "—"
    return f"{round(seconds / 60)} мин"


def _plural(n: int, one: str, few: str, many: str) -> str:
    """Русские окончания: 1 заказ, 2 заказа, 5 заказов."""
    if 11 <= n % 100 <= 14:
        return many
    return {1: one, 2: few, 3: few, 4: few}.get(n % 10, many)


def build_text(date: str) -> str:
    """Собрать сводку за день. Пустой день — короткая строка, без простыни нулей."""
    stats = db.stats_range([date])["summary"]
    total = stats["total"]
    den, mesyac = date[8:10].lstrip("0"), _MONTHS[int(date[5:7]) - 1]
    head = f"📊 <b>Итоги дня · {den} {mesyac}</b>"

    if not total:
        return f"{head}\n\nЗаказов не было."

    served = stats["served"]
    lines = [head, ""]
    hvost = "все выданы" if served == total else f"выдано {served}"
    lines.append(f"Заказов: <b>{total}</b>, {hvost}")
    lines.append(
        f"Готовка: {_mmin(stats['avgPrepSec'])} · "
        f"у окна: {_mmin(stats['avgWaitSec'])} · "
        f"всего: {_mmin(stats['avgTotalSec'])}"
    )

    fb = db.feedback_stats([date])
    lines.append("")
    if fb["count"]:
        ocenok = _plural(fb["count"], "оценка", "оценки", "оценок")
        lines.append(f"Оценки: {fb['count']} {ocenok}, средняя {fb['avgRating']} ★")
        # Охват — главная цифра этого блока, поэтому идёт отдельной строкой
        # даже когда он крошечный. Особенно когда крошечный.
        #
        # Проценты тут врут: 1 оценка на 222 заказа округляется в «0%», а это
        # читается как «никто не оценил» — то есть цифра, ради которой строка и
        # существует, теряется. Пишем как есть, дробью, и процент рядом только
        # когда он осмысленный.
        if fb["count"] and total:
            dolya = fb["count"] / total * 100
            hvost = f" ({dolya:.0f}%)" if dolya >= 1 else ""
            lines.append(f"Охват: {fb['count']} из {total} заказов{hvost}")
        if fb["negative"]:
            lines.append(f"⚠️ Недовольных: {fb['negative']}")
    else:
        lines.append("Оценок нет — ни один гость не оценил заказ")

    sob = db.security_summary(since=date)["byKind"]
    trevozhnye = {k: v for k, v in sob.items()
                  if k in ("login_failed", "login_blocked", "feedback_denied",
                           "claim_taken", "claim_too_many", "rate_limited")}
    if trevozhnye:
        lines.append("")
        lines.append("Безопасность: " + ", ".join(
            f"{_KIND_TEXT.get(k, k)} {v}" for k, v in trevozhnye.items()
        ))
    return "\n".join(lines)


_MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля",
           "августа", "сентября", "октября", "ноября", "декабря")

_KIND_TEXT = {
    "login_failed": "неверный пароль —",
    "login_blocked": "отклонённых входов —",
    "feedback_denied": "чужих отзывов —",
    "claim_taken": "занятых номеров —",
    "claim_too_many": "превышений лимита —",
    "rate_limited": "упёрлись в лимит —",
}


async def send_digest(date: str | None = None) -> int:
    """Отправить сводку за день. Возвращает число доставленных сообщений."""
    date = date or db.today()
    targets = notify.digest_targets()
    if not targets:
        logger.info("сводка: адресаты не заданы, молчим")
        return 0
    sent = await notify.send_message(build_text(date), targets)
    if sent:
        db.digest_mark_sent(date)
        logger.info("сводка за %s отправлена (%d адресатам)", date, sent)
    return sent


async def run_digest_loop() -> None:
    """Фон: раз в час смотрим, не пора ли отправить сводку за сегодня.

    Проверка ежечасная, а не «поспать до 23:00»: контейнер пересоздают ночными
    деплоями, и точный сон не пережил бы перезапуск. Отметка об отправке лежит
    в БД, поэтому повторный старт в тот же вечер второй раз не пришлёт.
    """
    if not settings.digest_enabled:
        logger.info("вечерняя сводка выключена")
        return
    logger.info("вечерняя сводка включена: в %02d:00", settings.digest_hour)
    while True:
        try:
            now = datetime.now(ZoneInfo(settings.timezone))
            date = now.date().isoformat()
            if now.hour >= settings.digest_hour and not db.digest_was_sent(date):
                await send_digest(date)
        except Exception as exc:  # noqa: BLE001 — сводка не должна ронять сервис
            logger.warning("сводка: ошибка: %s", exc)
        await asyncio.sleep(3600)
