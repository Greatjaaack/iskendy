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

    # Часовой пояс ресторана — по нему считается «сегодня».
    timezone: str = "Europe/Moscow"

    # Путь к SQLite-файлу.
    db_path: str = "iskendy.db"

    # Часовой пояс ресторана — по нему считается «сегодня» и окно свежести iiko.
    timezone: str = "Europe/Moscow"

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


settings = Settings()
