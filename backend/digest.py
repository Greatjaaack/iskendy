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
import httpx
import notify
from config import settings

logger = logging.getLogger("digest")


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
    # Колонку «открытый» показываем, только если в нём вообще бывали заказы:
    # иначе это столбец нулей во всю таблицу.
    est_otkrytyj = any(h.get("open") for h in rows)
    def m(sec):
        # Прочерк только когда данных нет вообще. Раньше здесь стояло `if sec`,
        # и честный ноль (заказ пролежал открытым 20 секунд) превращался в «—»,
        # то есть в «неизвестно». Ноль — это тоже ответ.
        return "—" if sec is None else f"{round(sec / 60)}"
    # Заголовки урезаны до трёх-четырёх букв намеренно: с полными словами
    # строка вылезает за 37 символов, и Telegram на телефоне уводит таблицу в
    # горизонтальную прокрутку. Расшифровки под таблицей больше нет — сводку
    # читают каждый день, и четыре строки пояснений к пяти колонкам оказались
    # дороже, чем сами колонки.
    out = ["Часы   Зак  Отк  Гот  Ждёт  Итог" if est_otkrytyj
           else "Часы   Зак   Гот  Ждёт  Итог"]
    for h in rows:
        chasy_txt = f"{h['hour']:02d}-{(h['hour'] + 1) % 24:02d}"
        metka = " ◀" if h["hour"] == pik_hour else ""
        otk = f" {m(h['open']):>4}" if est_otkrytyj else ""
        out.append(
            f"{chasy_txt}  {h['count']:>4}{otk} {m(h['preparing']):>4}"
            f" {m(h['ready']):>5} {m(h['total']):>5}{metka}"
        )
    return "<pre>" + "\n".join(out) + "</pre>"


def build_text(date: str, dengi: dict | None = None) -> str:
    """Собрать сводку за день. Пустой день — короткая строка, без простыни нулей."""
    stats = db.stats_range([date])
    su = stats["summary"]
    total = su["total"]
    den, mesyac = date[8:10].lstrip("0"), _MONTHS[int(date[5:7]) - 1]
    den_nedeli = _DAYS[datetime.fromisoformat(date).weekday()]
    head = f"📊 <b>Итоги за {den} {mesyac}, {den_nedeli}</b>"

    if not total:
        return f"{head}\n\nЗаказов не было."

    lines = [head]

    # Деньги — первым делом. Владелец открывает сводку ради выручки; всё
    # остальное он дочитает, только если она уже перед глазами.
    if dengi:
        lines += ["", f"Выручка: {_rubli(dengi['revenue'])}",
                  f"Чеков: {dengi['checks']}",
                  f"Средний чек: {_rubli(dengi['avg_check'])}"]

    lines += ["", f"Заказов: <b>{total}</b>"]

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

    # Средних по дню отдельным блоком нет: те же величины стоят в таблице по
    # часам, а заголовки и расшифровки к ней владелец попросил убрать — за
    # месяц чтения сводки колонки запоминаются, а сообщение короче на треть.
    tabl = _tablica_po_chasam(chasy, pik["hour"] if pik else None)
    if tabl:
        lines += ["", tabl]

    fb = db.feedback_stats([date])
    lines.append("")
    if fb["count"]:
        ocenok = _plural(fb["count"], "оценка", "оценки", "оценок")
        lines.append(f"Оценок: {fb['count']} {ocenok}")
        # Средний балл не считаем: при одной-двух оценках в день это не средняя,
        # а сама оценка, выданная за статистику. Важно другое — сколько их и
        # есть ли недовольные.
        if fb["negative"]:
            lines.append(f"⚠️ Недовольных: {fb['negative']}")
    else:
        lines.append("Оценок: нет")
    return "\n".join(lines)


_DAYS = ("понедельник", "вторник", "среда", "четверг", "пятница",
         "суббота", "воскресенье")

_MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля",
           "августа", "сентября", "октября", "ноября", "декабря")

async def send_digest(date: str | None = None) -> int:
    """Отправить сводку за день. Возвращает число доставленных сообщений."""
    if date is None:
        vchera = datetime.now(ZoneInfo(settings.timezone)) - timedelta(days=1)
        date = vchera.date().isoformat()
    targets = notify.digest_targets()
    if not targets:
        logger.info("сводка: адресаты не заданы, молчим")
        return 0
    dengi = await _dengi_za_den(date)
    sent = await notify.send_message(build_text(date, dengi), targets)
    if sent:
        db.digest_mark_sent(date)
        logger.info("сводка за %s отправлена (%d адресатам)", date, sent)
    else:
        # Без этой строки провал виден только по косвенным следам: отметки в базе
        # нет, а в логе — лишь предупреждения notify. Две сводки так и потерялись.
        logger.warning("сводка за %s НЕ ушла ни одному из %d адресатов",
                       date, len(targets))
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


# ------------------------------------------------------------------- деньги
# Выручку считает аналитика, у табло этих данных нет вовсе: в его базе только
# номер заказа и метки статусов. Читаем её внутренней ручкой /api/summary тем
# же токеном, что и заказы.
DENGI_TAYMAUT_SEC = 10


async def _dengi_za_den(date: str) -> dict | None:
    """Выручка, чеки и средний чек за день. None — если данных нет.

    Никогда не бросает: сводка про заказы важнее денежного блока, и молчащая
    аналитика не повод не отправить её вовсе.
    """
    url = settings.summary_url
    if not url or not settings.iiko_internal_token:
        return None
    try:
        async with httpx.AsyncClient(timeout=DENGI_TAYMAUT_SEC) as client:
            r = await client.get(
                url,
                params={"date": date},
                headers={"X-Internal-Token": settings.iiko_internal_token},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:  # noqa: BLE001 — деньги вторичны, сводка обязательна
        logger.warning("сводка: аналитика не ответила: %s", exc)
        return None
    # has_data=false значит «строки за этот день в базе нет», а не «выручка
    # ноль». Разница принципиальная: «Выручка: 0 ₽» в чате прочитают как факт.
    if not data.get("has_data"):
        logger.info("сводка: у аналитики нет данных за %s", date)
        return None
    return data


def _rubli(summa: float) -> str:
    """20330.5 → «20 330 ₽». Копейки в итоге дня не нужны."""
    return f"{round(summa):,}".replace(",", " ") + " ₽"
