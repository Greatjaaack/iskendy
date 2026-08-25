"""Вечерняя сводка: что попадает в текст и что из него не должно пропасть."""

import digest
from conftest import GUEST, STRANGER


def _den(client, staff, nomerov=3, ocenka=None):
    """Разыграть день: nomerov заказов доведены до «выдано», опционально отзыв."""
    for n in range(1, nomerov + 1):
        client.post("/api/order", json={"number": n}, headers=staff)
        client.post("/api/order/status", json={"number": n, "status": "served"},
                    headers=staff)
    if ocenka:
        token = client.post("/api/guest/claim", json={"number": 1, "guest": "ali"},
                            headers=GUEST).json()["claimToken"]
        client.post("/api/feedback",
                    json={"number": 1, "rating": ocenka, "claim_token": token},
                    headers=GUEST)


def test_den_bez_zakazov_odnoy_strokoy(client):
    """Пустой день не должен превращаться в простыню нулей."""
    import db

    text = digest.build_text(db.today())
    assert "Заказов не было" in text
    assert "Оценки" not in text


def test_zakazy_i_vremena(client, staff):
    import db

    _den(client, staff, nomerov=3)
    text = digest.build_text(db.today())
    assert "Заказов: <b>3</b>" in text
    assert "Готовится:" in text
    assert "Весь путь заказа:" in text


def test_pro_vydannye_molchim_poka_vsyo_vydano(client, staff):
    """«Все выданы» каждый день — шум: так и должно быть. Строка нужна только
    когда заказ завели и забыли выдать."""
    import db

    _den(client, staff, nomerov=3)
    assert "Не выдано" not in digest.build_text(db.today())


def test_nevydannye_zametny(client, staff):
    import db

    _den(client, staff, nomerov=2)
    client.post("/api/order", json={"number": 99}, headers=staff)   # остался висеть
    assert "Не выдано: 1" in digest.build_text(db.today())


def test_ocenki_pokazyvayutsya(client, staff):
    import db

    _den(client, staff, nomerov=5, ocenka=5)
    text = digest.build_text(db.today())
    assert "Оценок: 1 оценка" in text
    assert "Средняя: 5.0" in text


def test_bez_ocenok_govorim_pryamo(client, staff):
    import db

    _den(client, staff, nomerov=5)
    assert "Оценок: нет" in digest.build_text(db.today())


def test_negativ_vydelyaetsya(client, staff):
    import db

    _den(client, staff, nomerov=5, ocenka=2)
    text = digest.build_text(db.today())
    assert "Недовольных: 1" in text


def test_bezopasnost_v_svodku_ne_popadaet(client, staff, served_order):
    """Убрано по решению владельца: login_blocked повторялся каждый день — это
    смена логинится со второго устройства, а не атака. Ежедневное повторение
    приучает не читать."""
    import db

    client.post("/api/feedback", json={"number": served_order, "rating": 1},
                headers=STRANGER)
    text = digest.build_text(db.today())
    assert "Безопасность" not in text
    assert "чужих отзывов" not in text


def test_statusy_nazvany_kak_v_kasse(client, staff):
    """Раньше писали выдуманные «Кухня» и «Выдача» — таких статусов нет, и
    владелец не понял, что это значит. Плюс «приём → готово» смешивало лежание
    открытым с настоящей готовкой: 19 минут оказались 2 + 17."""
    import db

    _den(client, staff, nomerov=3)
    text = digest.build_text(db.today())
    for stroka in ("Открытый (ждёт готовки)", "Готовится:", "Готово (ждёт гостя)"):
        assert stroka in text, stroka
    assert "Кухня" not in text


def test_tablitsa_po_chasam_ne_shire_35(client, staff):
    """Шире ~35 символов Telegram уводит таблицу в горизонтальную прокрутку."""
    import db

    _den(client, staff, nomerov=4)
    text = digest.build_text(db.today())
    assert "<pre>" in text
    tabl = text.split("<pre>")[1].split("</pre>")[0]
    for stroka in tabl.split("\n"):
        assert len(stroka) <= 35, f"строка шире 35: {stroka!r}"


def test_pik_otmechen_v_tablitse_a_ne_strokoy(client, staff):
    """Отдельная строка про пик дублировала метку в таблице."""
    import db

    _den(client, staff, nomerov=3)
    text = digest.build_text(db.today())
    assert "◀" in text
    assert "Пик:" not in text


def test_nol_minut_ne_prochyerk(client, staff):
    """Ноль — это ответ, а не «нет данных». Заказ, пролежавший открытым 20
    секунд, показывался как «—», то есть как неизвестность."""
    import db

    _den(client, staff, nomerov=2)
    text = digest.build_text(db.today())
    tabl = text.split("<pre>")[1].split("</pre>")[0]
    assert "—" not in tabl, "мгновенные переходы должны быть нулями, а не прочерками"


def test_svodka_ne_uhodit_dvazhdy(client, staff):
    """Цикл проверяет раз в час: без отметки сообщение летело бы каждый час,
    а пересозданный ночным деплоем контейнер слал бы дубль."""
    import db

    den = db.today()
    assert db.digest_was_sent(den) is False
    db.digest_mark_sent(den)
    assert db.digest_was_sent(den) is True


def test_russkie_okonchaniya():
    assert digest._plural(1, "оценка", "оценки", "оценок") == "оценка"
    assert digest._plural(2, "оценка", "оценки", "оценок") == "оценки"
    assert digest._plural(5, "оценка", "оценки", "оценок") == "оценок"
    assert digest._plural(11, "оценка", "оценки", "оценок") == "оценок"
    assert digest._plural(21, "оценка", "оценки", "оценок") == "оценка"


def test_bez_adresatov_ne_padaem(client, staff):
    """Токена бота в тестах нет — сводка должна промолчать, а не сломаться."""
    import asyncio

    assert asyncio.run(digest.send_digest()) == 0


class TestDengi:
    """Выручку считает аналитика, у табло этих данных нет вовсе. Читаем её
    внутренней ручкой, и сводка не должна зависеть от того, отвечает ли она.
    """

    DENGI = {"date": "2026-08-24", "revenue": 100000.0, "checks": 200,
             "avg_check": 500.0, "has_data": True}

    def test_blok_deneg_pokazyvaetsya(self, client, staff):
        import db

        _den(client, staff, nomerov=3)
        text = digest.build_text(db.today(), self.DENGI)
        assert "Выручка: 100 000 ₽" in text
        assert "Чеков: 200" in text
        assert "Средний чек: 500 ₽" in text

    def test_bez_deneg_svodka_vsyo_ravno_polnaya(self, client, staff):
        """Аналитика молчит — сводка про заказы уходит как ни в чём не бывало."""
        import db

        _den(client, staff, nomerov=3)
        text = digest.build_text(db.today(), None)
        assert "Заказов: <b>3</b>" in text
        assert "Выручка" not in text
        assert "Деньги" not in text

    def test_nol_vyruchki_ne_pechataem_kak_fakt(self, monkeypatch):
        """has_data=false значит «строки за день нет», а не «заработали ноль».
        «Выручка: 0 ₽» в чате прочитают как факт — это худший вид вранья."""
        import asyncio

        import httpx
        from config import settings

        monkeypatch.setattr(settings, "analytics_summary_url", "http://analytics/api/summary")
        monkeypatch.setattr(settings, "iiko_internal_token", "t")

        class FakeResp:
            def raise_for_status(self): pass
            def json(self):
                return {"date": "2026-08-24", "revenue": 0, "checks": 0,
                        "avg_check": 0, "has_data": False}

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def get(self, *a, **kw): return FakeResp()

        monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: FakeClient())
        assert asyncio.run(digest._dengi_za_den("2026-08-24")) is None

    def test_analitika_upala_ne_ronyaet_svodku(self, monkeypatch):
        import asyncio

        import httpx
        from config import settings

        monkeypatch.setattr(settings, "analytics_summary_url", "http://analytics/api/summary")
        monkeypatch.setattr(settings, "iiko_internal_token", "t")

        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def get(self, *a, **kw):
                raise httpx.ConnectTimeout("аналитика недоступна")

        monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: FakeClient())
        assert asyncio.run(digest._dengi_za_den("2026-08-24")) is None

    def test_bez_nastroek_ne_hodim_v_set(self, monkeypatch):
        import asyncio

        from config import settings

        monkeypatch.setattr(settings, "analytics_summary_url", "")
        monkeypatch.setattr(settings, "iiko_orders_url", "")
        assert asyncio.run(digest._dengi_za_den("2026-08-24")) is None

    def test_adres_vyvoditsya_iz_adresa_zakazov(self, monkeypatch):
        """Держать два почти одинаковых URL в .env — значит однажды поменять
        только один."""
        from config import settings

        monkeypatch.setattr(settings, "analytics_summary_url", "")
        monkeypatch.setattr(settings, "iiko_orders_url",
                            "http://dashboards-backend-1:8000/api/orders/today")
        assert settings.summary_url == "http://dashboards-backend-1:8000/api/summary"

    def test_rubli_bez_kopeek_i_s_probelami(self):
        assert digest._rubli(100000.0) == "100 000 ₽"
        assert digest._rubli(20330.51) == "20 331 ₽"
        assert digest._rubli(0) == "0 ₽"
