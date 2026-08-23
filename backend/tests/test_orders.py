"""Основная механика табло: приём заказа, статусы, что видит гость."""

from conftest import GUEST


def test_zakaz_poyavlyaetsya_na_tablo(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    board = client.get("/api/status").json()
    assert [o["number"] for o in board["orders"]] == [42]
    assert board["orders"][0]["status"] == "preparing"


def test_vydannyj_uhodit_s_tablo_no_ostayotsya_v_istorii(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    board = client.get("/api/status").json()
    assert board["orders"] == []
    assert board["servedCount"] == 1
    history = client.get("/api/history", headers=staff).json()
    assert [o["number"] for o in history["orders"]] == [42]


def test_dubl_nomera_za_den_ne_zavoditsya(client, staff):
    """За месяц так набежало 34 дубля «iiko + вручную» — каждый портил времена."""
    assert client.post("/api/order", json={"number": 42}, headers=staff).status_code == 200
    r = client.post("/api/order", json={"number": 42}, headers=staff)
    assert r.status_code == 409
    assert "уже на табло" in r.json()["detail"]


def test_dubl_nomera_posle_vydachi_tozhe_ne_zavoditsya(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    r = client.post("/api/order", json={"number": 42}, headers=staff)
    assert r.status_code == 409
    assert "уже был и выдан" in r.json()["detail"]


def test_metki_vremeni_prostavlyayutsya(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "ready"}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    zakaz = client.get("/api/history", headers=staff).json()["orders"][0]
    assert zakaz["acceptedAt"] and zakaz["readyAt"] and zakaz["servedAt"]


def test_neizvestnyj_status_otklonyaetsya(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    r = client.post("/api/order/status", json={"number": 42, "status": "vydumannyj"},
                    headers=staff)
    assert r.status_code == 400


def test_udalyonnyj_zakaz_ne_ischezaet_iz_bazy(client, staff):
    """Ничего не удаляем физически: снятие проставляет deleted_at."""
    import sqlite3

    from config import settings

    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/delete", json={"number": 42}, headers=staff)
    assert client.get("/api/status").json()["orders"] == []
    with sqlite3.connect(settings.db_path) as conn:
        row = conn.execute(
            "SELECT deleted_at FROM orders WHERE number = 42"
        ).fetchone()
    assert row is not None and row[0], "строка должна остаться, но с меткой снятия"


def test_zhurnal_sobytiy_pishet_perehody(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "ready"}, headers=staff)
    events = client.get("/api/events", headers=staff).json()["events"]
    vidy = [e["event"] for e in events]
    assert "created" in vidy and "status" in vidy


def test_nomer_vne_diapazona_otklonyaetsya(client, staff):
    for plohoy in (0, -1, 100001):
        r = client.post("/api/order", json={"number": plohoy}, headers=staff)
        assert r.status_code == 422, plohoy
