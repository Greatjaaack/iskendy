"""Уведомления в Telegram (Bot API) — отзывы гостей и всё, что появится дальше.

Отдельный модуль, чтобы переиспользовать под другие уведомления. Главное
правило: ошибка отправки логируется и НЕ роняет запрос. Отзыв гостя важнее
уведомления о нём — гость не должен видеть ошибку из-за того, что Telegram
недоступен или в токене опечатка.

Маршрутизация:
  негатив (оценка <= feedback_negative_max) → всем `alert_targets`
      (личка владельца + тема рабочего чата) — его надо отработать в моменте;
  позитив                                    → `feedback_targets` (рабочий чат),
      чтобы смена видела все оценки, а не только жалобы.
"""

import html
import logging

import httpx
from config import settings

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


def targets_for(branch: str) -> list[tuple[str, int | None]]:
    """Кому уходит уведомление об отзыве этой ветки. Пустой список = молчим."""
    if not settings.feedback_alert_enabled or not settings.telegram_bot_token:
        return []
    if branch == "negative":
        return _dedup(settings.alert_targets)
    if not settings.feedback_notify_all:
        return []
    return _dedup(settings.feedback_targets)


async def send_message(text: str, targets: list[tuple[str, int | None]]) -> int:
    """Разослать текст адресатам. Возвращает число доставленных сообщений.

    Каждый адресат независим: упавшая отправка в один чат не мешает остальным.
    """
    if not targets or not settings.telegram_bot_token:
        return 0
    url = TELEGRAM_API.format(token=settings.telegram_bot_token)
    sent = 0
    # proxy=None — прямое соединение; на VPS в РФ без прокси Bot API недоступен.
    async with httpx.AsyncClient(
        timeout=SEND_TIMEOUT_SEC, proxy=settings.bot_proxy_url or None
    ) as client:
        for chat_id, thread_id in targets:
            payload: dict = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            }
            if thread_id is not None:
                payload["message_thread_id"] = thread_id
            try:
                r = await client.post(url, json=payload)
                if r.status_code == 200:
                    sent += 1
                else:
                    # Типовое: бот не добавлен в чат, тема удалена, кривой chat_id.
                    logger.warning(
                        "Telegram: чат %s ответил %s: %s",
                        chat_id, r.status_code, r.text[:200],
                    )
            except Exception as exc:  # noqa: BLE001 — уведомление не критично
                logger.warning("Telegram: не отправлено в %s: %s", chat_id, exc)
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
