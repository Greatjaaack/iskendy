"""Конфигурация сервиса табло заказов.

Все настройки читаются из окружения / .env через pydantic Settings —
не тянуть os.getenv по коду, брать `from config import settings`.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Авторизация кассы/персонала. Пустой пароль = вход выключен.
    staff_password: str = ""
    jwt_secret: str = ""  # при пустом выводится из пароля
    jwt_ttl_hours: int = 24

    # Часовой пояс ресторана — по нему считается «сегодня» и окно свежести iiko.
    timezone: str = "Europe/Moscow"

    # Путь к SQLite-файлу.
    db_path: str = "iskendy.db"

    # --- Подтягивание заказов из iiko (через ручку аналитики) ---
    # URL внутренней ручки аналитики (напр. http://dashboards-backend-1:8000/api/orders/today).
    # Пустой — поллинг выключен (табло работает только на ручном вводе).
    iiko_orders_url: str = ""
    iiko_internal_token: str = ""  # заголовок X-Internal-Token к ручке аналитики
    iiko_poll_seconds: int = 30  # период опроса
    # Окно свежести: заводим только заказы, открытые за последние N минут — чтобы
    # при старте/перезапуске не залить табло старыми уже готовыми заказами.
    iiko_ingest_window_min: int = 20

    # --- Ежедневный бэкап БД (ночью) ---
    backup_enabled: bool = True
    backup_keep: int = 30  # сколько последних ежедневных копий хранить (0 — не ротировать)
    backup_night_hour: int = 3  # час ночи (по поясу точки), когда снимать суточный бэкап

    # --- Отзывы гостей (docs/feedback-flow.md) ---
    # Куда гоним довольных гостей. Пустая ссылка = кнопка не показывается.
    review_url_yandex: str = ""
    review_url_2gis: str = ""
    social_url_telegram: str = ""
    social_url_instagram: str = ""
    # У точки пока нет VK. Появится — впишется в .env и сама встанет кнопкой.
    social_url_vk: str = ""

    # Уведомления об отзывах в Telegram. Общий рубильник; пустой токен/адресаты =
    # молчим (отзыв всё равно сохраняется — уведомление вторично).
    feedback_alert_enabled: bool = True
    telegram_bot_token: str = ""
    # Telegram в России блокируется, и с VPS запросы к api.telegram.org не
    # проходят. Прокси — единственный путь наружу; пустой = ходим напрямую.
    bot_proxy_url: str = ""
    # Негатив — срочный: летит всем адресатам, `chat_id[:thread_id]` через
    # запятую (личка владельца + тема рабочего чата). Разбор — в `alert_targets`.
    telegram_alert_targets: str = ""
    # Уведомлять и о хороших отзывах тоже (решение владельца: смена видит все
    # оценки, а не только жалобы). Позитив идёт только в рабочий чат.
    feedback_notify_all: bool = True
    # Куда «все отзывы». Пусто — берём тему рабочего чата из digest-адресата,
    # а если и его нет — тех же, кому идут алерты.
    telegram_feedback_targets: str = ""
    telegram_digest_target: str = ""  # куда вечернюю сводку (фаза 2)

    feedback_negative_max: int = 3  # оценка <= этой считается негативом
    feedback_prompt_delay_sec: int = 180  # пауза после «выдано» до экрана оценки
    # Сколько гость может дописывать детали и переставлять оценку. Раньше было
    # 30 минут — окно защищало от перебора feedback_id. Теперь перебор бессмыслен
    # (нужен ключ из ответа), так что даём спокойно доесть и подумать.
    feedback_edit_window_min: int = 120

    @property
    def alert_targets(self) -> list[tuple[str, int | None]]:
        """Разобранный `telegram_alert_targets` → [(chat_id, thread_id|None), ...]."""
        return parse_targets(self.telegram_alert_targets)

    @property
    def feedback_targets(self) -> list[tuple[str, int | None]]:
        """Адресаты уведомлений о хороших отзывах (рабочий чат)."""
        for raw in (self.telegram_feedback_targets, self.telegram_digest_target):
            targets = parse_targets(raw)
            if targets:
                return targets
        return self.alert_targets


def parse_targets(raw: str) -> list[tuple[str, int | None]]:
    """`chat_id[:thread_id]` через запятую → список пар.

    chat_id оставляем строкой: у групп он отрицательный и длинный, Bot API
    принимает его как есть. Кривые куски пропускаем молча — из-за одной опечатки
    в .env не должен отваливаться весь список адресатов.
    """
    targets: list[tuple[str, int | None]] = []
    for chunk in (raw or "").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        chat, _, thread = chunk.partition(":")
        chat = chat.strip()
        thread = thread.strip()
        if not chat:
            continue
        if thread and not thread.lstrip("-").isdigit():
            continue
        targets.append((chat, int(thread) if thread else None))
    return targets


settings = Settings()
