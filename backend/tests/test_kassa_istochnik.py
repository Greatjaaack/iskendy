"""Развязка табло от конкретной кассы.

Точка переезжает с iiko на СБИС Presto (касса одна, параллельной работы не
будет — переключение одним днём). Адаптер к кассе живёт в аналитике, но табло
хранит метку источника в `orders.source`, и раньше на строку `'iiko'` была
завязана логика. Такой сбой был бы молчаливым: заказы продолжили бы заводиться,
просто с неверным стартовым статусом в истории, и никто бы не заметил месяцами.

Здесь проверяется, что от имени кассы не зависит ничего, кроме самой метки.
"""

import sqlite3

import db
from config import Settings, settings


def _vstavit_bez_zhurnala(number: int, source: str) -> None:
    """Заказ прямо в базу, без событий: путь тогда считается по `source`.

    Именно так лежат заказы старше журнала — на них и срабатывала привязка
    к имени кассы.
    """
    with sqlite3.connect(settings.db_path) as conn:
        conn.execute(
            "INSERT INTO orders (date, number, status, created_at, updated_at, source)"
            " VALUES (?, ?, 'ready', ?, ?, ?)",
            (db.today(), number, "2026-09-19T12:00:00", "2026-09-19T12:05:00", source),
        )


def _pervyy_status(number: int) -> str:
    zakaz = next(o for o in db.stats_orders([db.today()])["orders"]
                 if o["number"] == number)
    return zakaz["timeline"][0]["status"]


class TestMetkaIstochnika:
    def test_metka_beretsya_iz_nastroek(self, client, monkeypatch):
        """В день переезда меняется одна строка в .env, а не код."""
        monkeypatch.setattr(settings, "kassa_source", "presto")
        assert db.ingest_kassa_order(601) is True

        zakaz = next(o for o in db.stats_orders([db.today()])["orders"]
                     if o["number"] == 601)
        assert zakaz["source"] == "presto"
        sobytie = next(e for e in db.get_events(db.today())
                       if e["number"] == 601 and e["event"] == "created")
        assert sobytie["source"] == "presto", "журнал обязан помнить, какая касса завела"

    def test_deduplikaciya_ne_zavisit_ot_kassy(self, client, monkeypatch):
        """Заказ, заведённый при iiko, не должен задвоиться после переезда.

        Случай реальный: переключение происходит посреди дня, и номера в базе
        остаются с прежней меткой.
        """
        monkeypatch.setattr(settings, "kassa_source", "iiko")
        assert db.ingest_kassa_order(602) is True
        monkeypatch.setattr(settings, "kassa_source", "presto")
        assert db.ingest_kassa_order(602) is False, "дедуп смотрит на номер, а не на кассу"


class TestStartovyyStatus:
    """`_order_path`: «пришёл с кассы» — это `source != "manual"`, а не список имён."""

    def test_zakaz_lyuboy_kassy_startuet_otkrytym(self, client):
        _vstavit_bez_zhurnala(611, "iiko")
        _vstavit_bez_zhurnala(612, "presto")
        assert _pervyy_status(611) == "open"
        assert _pervyy_status(612) == "open", \
            "новая касса не должна менять разбор истории"

    def test_ruchnoy_vvod_startuet_gotovitsya(self, client):
        _vstavit_bez_zhurnala(613, "manual")
        assert _pervyy_status(613) == "preparing"


class TestNastroyki:
    """Старое окружение обязано пережить выкатку: код едет на прод раньше .env."""

    def test_starye_imena_iiko_rabotayut(self, monkeypatch):
        monkeypatch.setenv("IIKO_ORDERS_URL", "http://analytics:8000/api/orders/today")
        monkeypatch.setenv("IIKO_INTERNAL_TOKEN", "tok")
        monkeypatch.setenv("IIKO_POLL_SECONDS", "11")
        monkeypatch.delenv("KASSA_ORDERS_URL", raising=False)
        monkeypatch.delenv("KASSA_INTERNAL_TOKEN", raising=False)

        s = Settings(_env_file=None)
        assert s.kassa_orders_url == "http://analytics:8000/api/orders/today"
        assert s.kassa_internal_token == "tok"
        assert s.kassa_poll_seconds == 11

    def test_novye_imena_pobezhdayut_starye(self, monkeypatch):
        monkeypatch.setenv("IIKO_ORDERS_URL", "http://staroe/api/orders/today")
        monkeypatch.setenv("KASSA_ORDERS_URL", "http://novoe/api/orders/today")
        assert Settings(_env_file=None).kassa_orders_url == "http://novoe/api/orders/today"

    def test_adres_deneg_vyvoditsya_iz_adresa_zakazov(self, monkeypatch):
        """Так задано на проде: один полный URL заказов и ничего больше.

        Если вывод сломать, сводка молча уйдёт без денежного блока.
        """
        monkeypatch.setenv("KASSA_ORDERS_URL", "http://analytics:8000/api/orders/today")
        monkeypatch.delenv("ANALYTICS_BASE_URL", raising=False)
        monkeypatch.delenv("ANALYTICS_SUMMARY_URL", raising=False)

        s = Settings(_env_file=None)
        assert s.summary_url == "http://analytics:8000/api/summary"
        assert s.orders_url == "http://analytics:8000/api/orders/today"

    def test_baza_i_puti_zadayutsya_otdelno(self, monkeypatch):
        monkeypatch.setenv("ANALYTICS_BASE_URL", "http://analytics:8000/")
        monkeypatch.delenv("KASSA_ORDERS_URL", raising=False)
        monkeypatch.delenv("IIKO_ORDERS_URL", raising=False)
        monkeypatch.delenv("ANALYTICS_SUMMARY_URL", raising=False)

        s = Settings(_env_file=None)
        assert s.orders_url == "http://analytics:8000/api/orders/today"
        assert s.summary_url == "http://analytics:8000/api/summary"

    def test_bez_nastroek_pusto(self, monkeypatch):
        """Пустой адрес — это выключенный поллер, а не падение на старте."""
        for key in ("KASSA_ORDERS_URL", "IIKO_ORDERS_URL", "ANALYTICS_BASE_URL",
                    "ANALYTICS_SUMMARY_URL"):
            monkeypatch.delenv(key, raising=False)
        s = Settings(_env_file=None)
        assert s.orders_url == ""
        assert s.summary_url == ""
