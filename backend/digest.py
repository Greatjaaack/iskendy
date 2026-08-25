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


def _tablica_po_chasam(chasy: list[dict], pik_hour: int | None) -> str:
    """Среднее время в каждом статусе по часу ПРИЁМА заказа.

    Telegram не умеет markdown-таблицы, но умеет <pre>: внутри него шрифт
    моноширинный и колонки сходятся. Форматирование внутри <pre> не работает,
    поэтому пик отмечаем символом, а не жирным.

    Час — это час приёма («13-14» = заказы, заведённые с 13:00 до 13:59), а не
    выдачи. Заказ, принятый в 13:55 и выданный в 14:10, попадёт в строку 13-14.
    """
    rows = [h for h in chasy if h.get("count")]
    if not rows:
        return ""
    def m(sec):
        # Прочерк только когда данных нет вообще. Раньше здесь стояло `if sec`,
        # и честный ноль (заказ пролежал открытым 20 секунд) превращался в «—»,
        # то есть в «неизвестно». Ноль — это тоже ответ.
        return "—" if sec is None else f"{round(sec / 60)}"
    # Заголовки урезаны до трёх-четырёх букв намеренно: с полными словами
    # строка вылезает за 37 символов, и Telegram на телефоне уводит таблицу в
    # горизонтальную прокрутку. Расшифровка идёт строкой выше таблицы.
    out = ["Часы   Зак  Отк  Гот  Ждёт  Итог"]
    for h in rows:
        chasy_txt = f"{h['hour']:02d}-{(h['hour'] + 1) % 24:02d}"
        metka = " ◀" if h["hour"] == pik_hour else ""
        out.append(
            f"{chasy_txt}  {h['count']:>4} {m(h['open']):>4} {m(h['preparing']):>4}"
            f" {m(h['ready']):>5} {m(h['total']):>5}{metka}"
        )
    return "<pre>" + "\n".join(out) + "</pre>"


def build_text(date: str) -> str:
    """Собрать сводку за день. Пустой день — короткая строка, без простыни нулей."""
    stats = db.stats_range([date])
    su = stats["summary"]
    total = su["total"]
    den, mesyac = date[8:10].lstrip("0"), _MONTHS[int(date[5:7]) - 1]
    den_nedeli = _DAYS[datetime.fromisoformat(date).weekday()]
    head = f"📊 <b>Итоги за {den} {mesyac}, {den_nedeli}</b>"

    if not total:
        return f"{head}\n\nЗаказов не было."

    lines = [head, "", f"Заказов: <b>{total}</b>"]

    # Невыданные — только когда они есть. Каждый день писать «все выданы»
    # незачем: так и должно быть, и строка превращается в шум.
    nevydano = total - su["served"]
    if nevydano:
        lines.append(f"⚠️ Не выдано: {nevydano}")

    # Отдельной строки про пик нет намеренно: он уже отмечен «◀» в таблице, а
    # дублировать одно и то же двумя способами значит удлинять сообщение, ничего
    # не добавляя.
    chasy = db.stats_po_statusam_chasy([date])
    pik = max(chasy, key=lambda h: h["count"]) if chasy else None

    # По статусам, а не по меткам заказа. В метках нет момента «взяли в работу»,
    # поэтому раньше сводка показывала «приём → готово» одним куском, где
    # лежание открытым и настоящая готовка были смешаны: 23.08 это было 19 минут,
    # из которых 2 заказ просто ждал, пока касса его возьмёт, и 17 готовился.
    st = db.stats_po_statusam([date])
    lines += ["", "<b>Сколько заказ провёл в каждом статусе</b>"]
    # «Ждёт готовки» — формулировка владельца. Оговорка для тех, кто будет
    # читать цифру: система знает только то, что кнопку «готовится» ещё не
    # нажали. Кухня могла уже начать, а кассир не отметить — вечером при малом
    # потоке открытый висит по 3-4 минуты, и это похоже именно на такое.
    lines.append(f"Открытый (ждёт готовки): {_mmin(st['open'])}")
    lines.append(f"Готовится: {_mmin(st['preparing'])}")
    lines.append(f"Готово (ждёт гостя): {_mmin(st['ready'])}")
    lines.append(f"Весь путь заказа: {_mmin(st['total'])}")

    tabl = _tablica_po_chasam(chasy, pik["hour"] if pik else None)
    if tabl:
        # Расшифровка колонок — по строке на колонку. Одной строкой через
        # разделители она не читается: на телефоне переносится в произвольном
        # месте и превращается в кашу.
        lines += ["", "<b>По часам приёма</b>",
                  "<i>Отк — ждёт готовки</i>",
                  "<i>Гот — готовится</i>",
                  "<i>Ждёт — ждёт гостя</i>",
                  "<i>Итог — весь путь заказа</i>",
                  "", tabl]

    fb = db.feedback_stats([date])
    lines.append("")
    if fb["count"]:
        ocenok = _plural(fb["count"], "оценка", "оценки", "оценок")
        lines.append(f"Оценок: {fb['count']} {ocenok}")
        lines.append(f"Средняя: {fb['avgRating']} ★")
        if fb["negative"]:
            lines.append(f"⚠️ Недовольных: {fb['negative']}")
    else:
        lines.append("Оценок: нет")
    return "\n".join(lines)


_DAYS = ("понедельник", "вторник", "среда", "четверг", "пятница",
         "суббота", "воскресенье")

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
    if date is None:
        vchera = datetime.now(ZoneInfo(settings.timezone)) - timedelta(days=1)
        date = vchera.date().isoformat()
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

    Проверка ежечасная, а не «поспать до полуночи»: контейнер пересоздают ночными
    деплоями, и точный сон не пережил бы перезапуск. Отметка об отправке лежит
    в БД, поэтому повторный старт в тот же вечер второй раз не пришлёт.
    """
    if not settings.digest_enabled:
        logger.info("вечерняя сводка выключена")
        return
    logger.info("сводка включена: в %02d:00 за прошедший день", settings.digest_hour)
    while True:
        try:
            now = datetime.now(ZoneInfo(settings.timezone))
            # Считаем за ПРОШЕДШИЙ день, а не за текущий. В полночь «сегодня» —
            # это новые пустые сутки; и даже в 23:00 смена ещё работает, так что
            # цифры были бы неполными. Итог подводим по закрытому дню.
            vchera = (now - timedelta(days=1)).date().isoformat()
            if now.hour >= settings.digest_hour and not db.digest_was_sent(vchera):
                await send_digest(vchera)
        except Exception as exc:  # noqa: BLE001 — сводка не должна ронять сервис
            logger.warning("сводка: ошибка: %s", exc)
        await asyncio.sleep(3600)
