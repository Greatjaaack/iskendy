"""Конфигурация сервиса статус-борда партий.

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

    # Дефолты нового дня (совпадают с Excel-листом партий).
    default_total_batches: int = 40
    default_start_time: str = "12:00"
    default_interval_min: int = 15
    batch_size: int = 7  # тушек в партии


settings = Settings()
