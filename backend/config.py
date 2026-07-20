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


settings = Settings()
