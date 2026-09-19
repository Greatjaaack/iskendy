"""Конфигурация сервиса табло заказов.

Все настройки читаются из окружения / .env через pydantic Settings —
не тянуть os.getenv по коду, брать `from config import settings`.
"""

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Авторизация кассы/персонала. Пустой пароль = вход выключен.
    staff_password: str = ""
    jwt_secret: str = ""  # при пустом выводится из пароля
    jwt_ttl_hours: int = 24

    # Часовой пояс ресторана — по нему считается «сегодня» и окно свежести кассы.
    timezone: str = "Europe/Moscow"

    # Путь к SQLite-файлу.
    db_path: str = "iskendy.db"

    # --- Подтягивание заказов с кассы (через ручку аналитики) ---
    # Табло в кассу не ходит и про неё ничего не знает: оно опрашивает ручку
    # аналитики и ждёт от неё контракт {"orders": [{"number", "openTime"}]}.
    # Какая касса стоит за аналитикой — iiko, СБИС Presto или что-то ещё — здесь
    # не имеет значения; при переезде в этом файле меняется только `kassa_source`.
    #
    # Старые имена IIKO_* остаются рабочими алиасами: код выкатывается на прод
    # раньше, чем правится .env, и выкатка не должна гасить поллер.
    kassa_orders_url: str = Field(
        "", validation_alias=AliasChoices("KASSA_ORDERS_URL", "IIKO_ORDERS_URL")
    )
    kassa_internal_token: str = Field(  # заголовок X-Internal-Token к ручке аналитики
        "", validation_alias=AliasChoices("KASSA_INTERNAL_TOKEN", "IIKO_INTERNAL_TOKEN")
    )
    kassa_poll_seconds: int = Field(  # период опроса
        30, validation_alias=AliasChoices("KASSA_POLL_SECONDS", "IIKO_POLL_SECONDS")
    )
    # Окно свежести: заводим только заказы, открытые за последние N минут — чтобы
    # при старте/перезапуске не залить табло старыми уже готовыми заказами.
    kassa_ingest_window_min: int = Field(
        20,
        validation_alias=AliasChoices(
            "KASSA_INGEST_WINDOW_MIN", "IIKO_INGEST_WINDOW_MIN"
        ),
    )
    # Чем помечаются в базе заказы, приехавшие с кассы (колонка orders.source).
    # В день переезда меняется на `presto` — и только эта строка отличает старые
    # заказы от новых в истории. Логика нигде не завязана на конкретное значение:
    # «пришёл с кассы» — это `source != "manual"`.
    kassa_source: str = "iiko"

    # Сервис аналитики: базовый адрес и пути ручек. Раньше адрес сводки
    # выводился из адреса заказов подстановкой `/api/orders/today` → `/api/summary`
    # прямо в коде — переезд ручки на стороне аналитики молча оставил бы сводку
    # без денег. Теперь оба пути видно и правятся они в .env.
    analytics_base_url: str = ""  # напр. http://dashboards-backend-1:8000
    analytics_orders_path: str = "/api/orders/today"
    analytics_summary_path: str = "/api/summary"
    # Явный адрес ручки с деньгами — override сборки из базы.
    # Пусто и базы нет — в сводке просто не будет денежного блока.
    analytics_summary_url: str = ""

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
    telegram_digest_target: str = ""  # куда вечернюю сводку
    # Сводка: итог дня одним сообщением, за ПРОШЕДШИЙ день. Час — по поясу
    # точки; проверка ежечасная, поэтому сообщение уходит в первый тик после
    # этого часа. Полночь выбрана намеренно: раньше смена ещё работает и цифры
    # неполные.
    digest_enabled: bool = True
    digest_hour: int = 0

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
    def analytics_base(self) -> str:
        """Базовый адрес сервиса аналитики.

        Задан явно — берём его. Не задан — выводим из адреса заказов, отрезав
        путь: на проде в .env лежит только полный URL заказов, и вывод базы
        держит совместимость со старым окружением. Обе ручки живут на одном
        сервисе, и держать два почти одинаковых URL в .env значит однажды
        поменять только один.
        """
        if self.analytics_base_url:
            return self.analytics_base_url.rstrip("/")
        url, path = self.kassa_orders_url, self.analytics_orders_path
        if url and path and url.endswith(path):
            return url[: -len(path)].rstrip("/")
        return ""

    def _ruchka(self, path: str) -> str:
        """Собрать адрес ручки аналитики из базы и пути."""
        base = self.analytics_base
        return f"{base}/{path.lstrip('/')}" if base and path else ""

    @property
    def orders_url(self) -> str:
        """Адрес ручки со списком заказов за сегодня. Пустой — поллер выключен."""
        return self.kassa_orders_url or self._ruchka(self.analytics_orders_path)

    @property
    def summary_url(self) -> str:
        """Адрес ручки с деньгами за день. Пустой — сводка уйдёт без денег."""
        return self.analytics_summary_url or self._ruchka(self.analytics_summary_path)

    @property
    def digest_targets(self) -> list[tuple[str, int | None]]:
        """Куда вечернюю сводку. Пусто — туда же, куда отзывы: сводка про гостей."""
        return parse_targets(self.telegram_digest_target) or self.feedback_targets

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
