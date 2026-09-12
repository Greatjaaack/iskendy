"""Уведомления в Telegram (Bot API) — отзывы гостей и всё, что появится дальше.

Отдельный модуль, чтобы переиспользовать под другие уведомления. Главное
правило: ошибка отправки логируется и НЕ роняет запрос. Отзыв гостя важнее
уведомления о нём — гость не должен видеть ошибку из-за того, что Telegram
недоступен или в токене опечатка.

Маршрутизация — две темы рабочего чата, разные по смыслу:
  отзывы гостей, обе ветки → `feedback_targets` (тема отзывов). Смена смотрит
      её, чтобы успеть к гостю, пока он не ушёл;
  сбои и безопасность      → `alert_targets` (тема аварий). Туда же уходит всё,
      с чем автоматика не справилась сама.

Личных адресатов нет намеренно: система должна работать без владельца, а не
через него.
"""

import asyncio
import html
import logging
import re

import httpx
from config import settings
from oshibki import opisanie

logger = logging.getLogger("notify")

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
SEND_TIMEOUT_SEC = 10


def _dedup(targets: list[tuple[str, int | None]]) -> list[tuple[str, int | None]]:
    """Один и тот же чат может прийти из двух настроек — шлём туда один раз."""
    seen: set[tuple[str, int | None]] = set()
    out: list[tuple[str, int | None]] = []
    for t in targets:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def digest_targets() -> list[tuple[str, int | None]]:
    """Адресаты вечерней сводки. Не зависит от рубильника отзывов: сводка — про
    день целиком, а не про поток оценок."""
    if not settings.telegram_bot_token:
        return []
    return _dedup(settings.digest_targets)


def targets_for(branch: str) -> list[tuple[str, int | None]]:
    """Кому уходит уведомление об отзыве этой ветки. Пустой список = молчим.

    Обе ветки идут в тему отзывов, а не в тему аварий. Раньше негатив уезжал в
    `alert_targets` — тогда там была личка владельца, и это имело смысл. Теперь
    там сбои и безопасность, и жалоба гостя в этом потоке только мешала бы:
    смена смотрит отзывы, чтобы успеть к человеку, пока он не ушёл, и ей нужен
    ровно один канал про гостей.

    Разница между ветками осталась в другом: негатив уходит всегда, а поток
    хороших оценок можно выключить рубильником `feedback_notify_all`.
    """
    if not settings.feedback_alert_enabled or not settings.telegram_bot_token:
        return []
    if branch != "negative" and not settings.feedback_notify_all:
        return []
    return _dedup(settings.feedback_targets)


# Прокси, через который прошло прошлое сообщение. Держим, чтобы не долбиться
# каждый раз в мёртвый первый адрес и не ждать его таймаут на каждой отправке.
_zhivoy_proxy: str | None = None


def proxy_list() -> list[str | None]:
    """Адреса прокси по порядку попыток.

    `BOT_PROXY_URL` принимает несколько адресов через запятую: арендованный
    прокси — расходник, и когда он падает, замолкает разом всё — и вечерняя
    сводка, и аварии сторожа. Один адрес означает ровно одну точку отказа,
    поэтому резерв живёт рядом с основным.

    Пустая настройка — прямое соединение (`None`): годится там, где Telegram
    доступен, на VPS в РФ он не отвечает вовсе.
    """
    spisok: list[str | None] = [
        p.strip() for p in settings.bot_proxy_url.split(",") if p.strip()
    ]
    if not spisok:
        return [None]
    # Рабочий — первым: после падения основного нет смысла начинать с него.
    if _zhivoy_proxy in spisok:
        spisok = [_zhivoy_proxy] + [p for p in spisok if p != _zhivoy_proxy]
    return spisok


def hide_password(proxy: str | None) -> str:
    """Адрес прокси для лога: host:port без логина и пароля."""
    if not proxy:
        return "напрямую"
    return re.sub(r"://[^@]+@", "://", proxy)


async def _deliver(url: str, payload: dict, chat_id: str) -> bool:
    """Доставить одно сообщение, перебирая прокси до первого успеха.

    Переключаемся только на сетевой ошибке. Ответ Telegram с кодом — это про
    чат, тему или токен: другой прокси тут ничего не исправит, а повтор разослал
    бы дубли.
    """
    global _zhivoy_proxy
    for proxy in proxy_list():
        try:
            async with httpx.AsyncClient(
                timeout=SEND_TIMEOUT_SEC, proxy=proxy
            ) as client:
                r = await client.post(url, json=payload)
        except Exception as exc:  # noqa: BLE001 — пробуем следующий адрес
            # Тип обязателен: у ConnectTimeout пустое сообщение, и две ночи
            # подряд (09–11.09.2026) лог показывал «не отправлено в 121331370:»
            # без единого намёка, что лежит прокси, а не токен.
            logger.warning(
                "Telegram: прокси %s не отвечает: %s",
                hide_password(proxy), opisanie(exc),
            )
            continue
        if r.status_code == 200:
            if proxy != _zhivoy_proxy:
                logger.info("Telegram: работает через %s", hide_password(proxy))
            _zhivoy_proxy = proxy
            return True
        # Типовое: бот не добавлен в чат, тема удалена, кривой chat_id.
        logger.warning(
            "Telegram: чат %s ответил %s: %s", chat_id, r.status_code, r.text[:200],
        )
        return False
    logger.warning("Telegram: не отправлено в %s — не ответил ни один прокси", chat_id)
    return False


async def send_message(text: str, targets: list[tuple[str, int | None]]) -> int:
    """Разослать текст адресатам. Возвращает число доставленных сообщений.

    Каждый адресат независим: упавшая отправка в один чат не мешает остальным.
    """
    if not targets or not settings.telegram_bot_token:
        return 0
    url = TELEGRAM_API.format(token=settings.telegram_bot_token)
    sent = 0
    for chat_id, thread_id in targets:
        payload: dict = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if thread_id is not None:
            payload["message_thread_id"] = thread_id
        if await _deliver(url, payload, chat_id):
            sent += 1
    return sent


def _wait_text(seconds: int | None) -> str:
    if seconds is None:
        return "—"
    if seconds < 60:
        return "меньше минуты"
    return f"{round(seconds / 60)} мин"


def _esc(value: str | None) -> str:
    return html.escape(str(value or ""))


def format_feedback(fb: dict, branch: str) -> str:
    """Сообщение об отзыве. Формат — docs/feedback-flow.md.

    🔴 Оценка 2 · заказ №5221
    Ждал: 14 мин
    Теги: долго ждали, остыло
    «Заказ ждал 15 минут, дюрюм принесли холодным»
    Контакт: @arslan_t
    """
    mark = "🔴" if branch == "negative" else "🟢"
    lines = [
        f"{mark} <b>Оценка {fb.get('rating')}★ · заказ №{fb.get('number')}</b>",
        f"Ждал: {_wait_text(fb.get('waitSeconds'))}",
    ]
    tags = fb.get("tags") or []
    if isinstance(tags, str):
        tags = [t for t in tags.split(",") if t]
    if tags:
        lines.append("Теги: " + _esc(", ".join(tags)))
    if fb.get("comment"):
        lines.append(f"«{_esc(fb['comment'])}»")
    if fb.get("contact"):
        lines.append(f"Контакт: {_esc(fb['contact'])}")
    return "\n".join(lines)


async def notify_feedback(fb: dict, branch: str) -> int:
    """Уведомление о новой оценке — сразу по первому тапу гостя.

    Шлём, не дожидаясь деталей: гость может закрыть вкладку, а негатив надо
    увидеть, пока он ещё у окна.
    """
    targets = targets_for(branch)
    if not targets:
        return 0
    return await send_message(format_feedback(fb, branch), targets)


async def notify_feedback_changed(fb: dict, was: int) -> int:
    """Гость исправил оценку. Шлём и тем, кто получил первое сообщение, и тем,
    кому положена новая ветка: иначе владелец побежит отрабатывать негатив,
    которого больше нет (или наоборот — пропустит появившийся)."""
    rating = fb.get("rating") or 0
    old_branch = "negative" if was <= settings.feedback_negative_max else "positive"
    new_branch = "negative" if rating <= settings.feedback_negative_max else "positive"
    targets = _dedup(targets_for(old_branch) + targets_for(new_branch))
    if not targets:
        return 0
    mark = "🔴" if new_branch == "negative" else "🟢"
    text = (
        f"{mark} <b>Оценка исправлена · заказ №{fb.get('number')}</b>\n"
        f"Было {was}★ → стало {rating}★"
    )
    return await send_message(text, targets)


async def notify_feedback_detail(fb: dict, branch: str) -> int:
    """Дополнение к уже отправленному уведомлению: теги, текст, контакт.

    Отдельным сообщением, а не правкой прежнего: правка требует хранить
    message_id и переживать перезапуск, а выигрыш — косметический.
    """
    if not (fb.get("tags") or fb.get("comment") or fb.get("contact")):
        return 0
    targets = targets_for(branch)
    if not targets:
        return 0
    head = f"↑ Детали к заказу №{fb.get('number')}"
    body = format_feedback(fb, branch).split("\n", 2)
    # Первые две строки (оценка и ожидание) уже были в первом сообщении.
    tail = body[2] if len(body) > 2 else ""
    return await send_message(f"{head}\n{tail}".strip(), targets)


# ----------------------------------------------------------- схлопывание
# Один отклонённый вход — одно сообщение. Но лимит пропускает десять попыток в
# минуту, то есть шестьсот в час: атака превратила бы тему в стену одинаковых
# строк, а живой человек в ответ замьютил бы её — и перестал видеть настоящие
# аварии. Поэтому первое сообщение уходит сразу, повторы того же вида копятся
# молча, и в конце окна прилетает одна строка с их числом.
THROTTLE_WINDOW_SEC = 600

_throttle: dict[str, dict] = {}
_throttle_tasks: set[asyncio.Task] = set()


async def _flush_throttled(key: str, targets: list[tuple[str, int | None]]) -> None:
    """Досказать по итогам окна, сколько повторов было проглочено."""
    await asyncio.sleep(THROTTLE_WINDOW_SEC)
    state = _throttle.pop(key, None)
    if not state or not state["suppressed"]:
        return
    await send_message(
        f"↑ и ещё {state['suppressed']} таких за "
        f"{THROTTLE_WINDOW_SEC // 60} мин",
        targets,
    )


async def send_throttled(
    key: str, text: str, targets: list[tuple[str, int | None]]
) -> int:
    """Отправить, если по этому ключу недавно не отправляли. Иначе — сосчитать.

    `key` — вид события, а не конкретный случай: десять попыток входа с разных
    адресов это всё равно одна история, и десять сообщений про неё не нужны.
    """
    if not targets:
        return 0
    state = _throttle.get(key)
    if state is not None:
        state["suppressed"] += 1
        return 0
    _throttle[key] = {"suppressed": 0}
    sent = await send_message(text, targets)
    # Ссылку на задачу держим: без неё сборщик мусора может убить отложенную
    # досылку, и счётчик повторов молча пропадёт.
    task = asyncio.create_task(_flush_throttled(key, targets))
    _throttle_tasks.add(task)
    task.add_done_callback(_throttle_tasks.discard)
    return sent


# ------------------------------------------------------- сбои и безопасность
# Уходят в отдельную тему рабочего чата (`alert_targets`) и не зависят от
# рубильника отзывов: узнать, что кассу пытались открыть чужим устройством,
# важнее, чем поток оценок, и выключаться вместе с ним не должно.
def _security_targets() -> list[tuple[str, int | None]]:
    if not settings.telegram_bot_token:
        return []
    return _dedup(settings.alert_targets)


async def notify_login_blocked(active: dict, ip: str = "", ua: str = "") -> int:
    """Кто-то ввёл верный пароль, пока касса открыта на другом устройстве.

    Пароль один на всех и открывает аналитику, контакты гостей и выгрузку базы.
    Верный пароль со стороны — это либо свой человек с телефона, либо утечка;
    отличить может только владелец, поэтому решение за ним, а наше дело — успеть
    сказать.
    """
    targets = _security_targets()
    if not targets:
        return 0
    text = (
        "🔐 <b>Отклонён вход в кассу</b>\n"
        "Пароль верный, но касса уже открыта на другом устройстве.\n"
        f"Откуда: {_esc(ip) or '—'}\n"
        f"Устройство: {_esc(ua[:120]) or '—'}\n"
        f"Текущая сессия с: {_esc(active.get('createdAt'))}\n"
        "Если это не вы — смените пароль."
    )
    return await send_throttled("login_blocked", text, targets)


async def notify_claim_anomaly(guest: str, count: int, ip: str = "") -> int:
    """Одно устройство занимает номера пачкой — похоже на попытку сорвать отзывы."""
    targets = _security_targets()
    if not targets:
        return 0
    text = (
        "⚠️ <b>Странная активность на табло</b>\n"
        f"Одно устройство заняло сегодня номеров: {count}\n"
        f"Откуда: {_esc(ip) or '—'}\n"
        f"Метка устройства: {_esc(guest)}"
    )
    return await send_throttled("claim_anomaly", text, targets)
