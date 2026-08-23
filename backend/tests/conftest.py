"""Общая обвязка тестов.

Два правила, ради которых этот файл существует.

Первое: переменные окружения выставляются ДО импорта приложения. `config.py`
создаёт `settings` на уровне модуля, то есть в момент первого импорта, и
поменять их потом уже нельзя.

Второе: настройки Telegram глушатся принудительно. В корне репозитория лежит
боевой `.env` с настоящим токеном бота и адресом рабочего чата; pydantic читает
его, если не перебить окружением. Без этого тесты писали бы в чат смены.
Страховка двойная — сверху ещё и `notify.send_message` подменяется заглушкой.
"""

import os
import tempfile
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.gettempdir()) / "iskendy_pytest.db"

os.environ.update(
    DB_PATH=str(_TMP_DB),
    STAFF_PASSWORD="testpass",
    JWT_SECRET="test-secret-not-derived-from-password",
    JWT_TTL_HOURS="24",
    TIMEZONE="Europe/Moscow",
    # Ничего наружу: ни Telegram, ни iiko, ни ночной бэкап.
    TELEGRAM_BOT_TOKEN="",
    TELEGRAM_ALERT_TARGETS="",
    TELEGRAM_FEEDBACK_TARGETS="",
    TELEGRAM_DIGEST_TARGET="",
    BOT_PROXY_URL="",
    FEEDBACK_ALERT_ENABLED="false",
    IIKO_ORDERS_URL="",
    IIKO_INTERNAL_TOKEN="",
    BACKUP_ENABLED="false",
)

import db  # noqa: E402
import main  # noqa: E402
import notify  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PASSWORD = "testpass"
# Так выглядит заголовок, который ставит Caddy: сначала то, что прислал клиент,
# в конце — настоящий адрес соединения. Тесты обязаны ходить именно так, иначе
# проверяют не то, что происходит в проде.
CASHIER = {"X-Forwarded-For": "178.66.4.10"}
GUEST = {"X-Forwarded-For": "91.76.12.4"}
STRANGER = {"X-Forwarded-For": "45.130.9.88"}


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    """Чистая база и чистые счётчики на каждый тест.

    Лимиты и активная сессия кассы — глобальное состояние: без сброса тест,
    упёршийся в лимит, роняет следующий, а забытая сессия ломает вход.
    """
    for suffix in ("", "-wal", "-shm"):
        Path(str(_TMP_DB) + suffix).unlink(missing_ok=True)
    db.init_db()
    main._rate_hits.clear()
    notify._throttle.clear()

    sent: list[tuple[str, list]] = []

    async def _capture(text, targets):
        sent.append((text, targets))
        return len(targets)

    # Заглушка вместо сети. Даже если конфиг однажды разъедется, наружу
    # не уйдёт ничего, а тесты смогут проверить, что уведомление собиралось.
    monkeypatch.setattr(notify, "send_message", _capture)
    yield sent
    for suffix in ("", "-wal", "-shm"):
        Path(str(_TMP_DB) + suffix).unlink(missing_ok=True)


@pytest.fixture
def client():
    """Клиент, который выглядит как запрос из-за Caddy.

    По умолчанию TestClient представляется адресом `testclient` — это не IP, и
    `_trusted_peer` такому не верит, поэтому X-Forwarded-For игнорируется и все
    запросы сваливаются в одну корзину лимита. Тесты про адреса тогда ничего не
    проверяют, хотя выглядят зелёными. Подставляем адрес из сети docker, как у
    настоящего Caddy, — и заголовки начинают работать как в проде.
    """
    with TestClient(main.app, client=("172.18.0.5", 33333)) as c:
        yield c


@pytest.fixture
def staff(client):
    """Залогиненная касса: заголовки с токеном."""
    r = client.post("/api/auth/login", json={"password": PASSWORD}, headers=CASHIER)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", **CASHIER}


@pytest.fixture
def served_order(client, staff):
    """Заказ №42, доведённый до «выдано» — состояние, в котором можно оценивать."""
    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    return 42
