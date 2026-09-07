"""Откат ошибочной выдачи.

Кнопки «Выдано ✓» стоят в строках вплотную, и кассир в час пик попадает в
соседнюю. Заказ исчезает с табло, а гость, который отошёл, больше не узнаёт,
что его еда готова: номера нет, и телефон через три минуты предложит оценить
заказ, которого человек не получал. До этой правки отката не было вовсе.
"""

import pytest
from conftest import GUEST


def _vydat(client, staff, nomer, cherez_gotovo=True):
    """Обычный путь заказа: завели, приготовили, выдали."""
    client.post("/api/order", json={"number": nomer}, headers=staff)
    if cherez_gotovo:
        client.post("/api/order/status", json={"number": nomer, "status": "ready"},
                    headers=staff)
    client.post("/api/order/status", json={"number": nomer, "status": "served"},
                headers=staff)


def test_vydannyj_vozvrashchaetsya_na_tablo(client, staff):
    _vydat(client, staff, 42)
    assert client.get("/api/status").json()["orders"] == []
    r = client.post("/api/order/revert", json={"number": 42}, headers=staff)
    assert r.status_code == 200
    board = client.get("/api/status").json()["orders"]
    assert [o["number"] for o in board] == [42]
    assert board[0]["status"] == "ready"


def test_metka_vydachi_stiraetsya(client, staff):
    """Иначе заказ разом выдан и не выдан, а «готово → выдано» в аналитике
    посчитается от ошибочного нажатия."""
    import db

    _vydat(client, staff, 42)
    client.post("/api/order/revert", json={"number": 42}, headers=staff)
    zakaz = db.get_board()["orders"][0]
    assert zakaz["servedAt"] is None
    assert zakaz["readyAt"] is not None, "готовность не трогаем, она была настоящей"


def test_vozvrat_popadaet_v_zhurnal(client, staff):
    _vydat(client, staff, 42)
    client.post("/api/order/revert", json={"number": 42}, headers=staff)
    events = client.get("/api/events", headers=staff).json()["events"]
    vozvrat = [e for e in events
               if e.get("from_status") == "served" and e.get("to_status") == "ready"]
    assert vozvrat, f"переход served→ready должен быть в журнале: {events}"


def test_nevydannyj_vozvrashchat_nechego(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    r = client.post("/api/order/revert", json={"number": 42}, headers=staff)
    assert r.status_code == 400
    assert "не выдан" in r.json()["detail"]


def test_nesushchestvuyushchiy_zakaz(client, staff):
    r = client.post("/api/order/revert", json={"number": 999}, headers=staff)
    assert r.status_code == 400
    assert "сегодня нет" in r.json()["detail"]


def test_s_otzyvom_vozvrat_zapreshchyon(client, staff):
    """Отзыв возможен только после выдачи. Есть отзыв — значит гость заказ
    получил, и промахом это не было."""
    _vydat(client, staff, 42)
    token = client.post("/api/guest/claim", json={"number": 42, "guest": "ali"},
                        headers=GUEST).json()["claimToken"]
    client.post("/api/feedback", json={"number": 42, "rating": 5, "claim_token": token},
                headers=GUEST)
    r = client.post("/api/order/revert", json={"number": 42}, headers=staff)
    assert r.status_code == 400
    assert "отзыв" in r.json()["detail"]


def test_vydacha_minuya_gotovo_vosstanavlivaet_otmetku(client, staff):
    """В интерфейсе так не нажать, но через API можно. Заказ, который выдали,
    точно был готов — иначе он выпадет из расчёта времён как готовый без
    времени готовности."""
    import db

    _vydat(client, staff, 42, cherez_gotovo=False)
    client.post("/api/order/revert", json={"number": 42}, headers=staff)
    zakaz = db.get_board()["orders"][0]
    assert zakaz["readyAt"] is not None
    assert zakaz["servedAt"] is None


def test_posle_vozvrata_mozhno_vydat_snova(client, staff):
    _vydat(client, staff, 42)
    client.post("/api/order/revert", json={"number": 42}, headers=staff)
    r = client.post("/api/order/status", json={"number": 42, "status": "served"},
                    headers=staff)
    assert r.status_code == 200
    assert client.get("/api/status").json()["orders"] == []


class TestSpisokVydannyh:
    """Кассир не видит выданных вовсе: они уходят с табло, а история фронтом
    не запрашивается. Промахнувшись, он не может даже посмотреть, что закрыл."""

    def test_svezhie_sverhu(self, client, staff):
        for n in (1, 2, 3):
            _vydat(client, staff, n)
        spisok = client.get("/api/order/served", headers=staff).json()["orders"]
        assert [o["number"] for o in spisok] == [3, 2, 1]

    def test_zakaz_s_otzyvom_pomechen_kak_nevozvratnyj(self, client, staff):
        _vydat(client, staff, 42)
        token = client.post("/api/guest/claim", json={"number": 42, "guest": "ali"},
                            headers=GUEST).json()["claimToken"]
        client.post("/api/feedback",
                    json={"number": 42, "rating": 5, "claim_token": token}, headers=GUEST)
        spisok = client.get("/api/order/served", headers=staff).json()["orders"]
        assert spisok[0]["canRevert"] is False

    def test_bez_otzyva_vozvrashchaemyj(self, client, staff):
        _vydat(client, staff, 42)
        spisok = client.get("/api/order/served", headers=staff).json()["orders"]
        assert spisok[0]["canRevert"] is True

    def test_bez_tokena_nelzya(self, client):
        assert client.get("/api/order/served").status_code == 401
        assert client.post("/api/order/revert", json={"number": 1}).status_code == 401
