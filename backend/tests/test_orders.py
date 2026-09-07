"""Основная механика табло: приём заказа, статусы, что видит гость."""

from conftest import GUEST


def test_zakaz_poyavlyaetsya_na_tablo(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    board = client.get("/api/status").json()
    assert [o["number"] for o in board["orders"]] == [42]
    assert board["orders"][0]["status"] == "preparing"


def test_vydannyj_uhodit_s_tablo_no_ostayotsya_v_istorii(client, staff):
    import db

    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    board = client.get("/api/status").json()
    assert board["orders"] == []
    assert board["servedCount"] == 1
    assert [o["number"] for o in db.stats_orders([db.today()])["orders"]] == [42]


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
    """Метки читаем прямо из строки заказа, а не через путь по журналу событий:
    журнал хранит те же переходы отдельно, и по нему тест остался бы зелёным,
    даже если метку в строке перестать проставлять."""
    import sqlite3

    from config import settings

    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "ready"}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    with sqlite3.connect(settings.db_path) as conn:
        metki = conn.execute(
            "SELECT created_at, ready_at, served_at FROM orders WHERE number = 42"
        ).fetchone()
    assert all(metki), f"все три метки должны быть проставлены: {metki}"


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


class TestBezOtkrytogo:
    """С 26.08 поллер заводит заказы сразу в «готовится».

    Раньше заказ приезжал из iiko «открытым» и ждал, пока кассир нажмёт
    «Готовить →». По факту лежал так 2-4 минуты, а гость всё это время не видел
    своего номера на табло: открытые туда не попадают. Разделение «касса
    приняла» и «кухня взяла» смысла не несло — кнопку жали механически.
    """

    def test_zakaz_iz_iiko_srazu_gotovitsya(self, client):
        import db

        assert db.ingest_iiko_order(501) is True
        board = client.get("/api/status").json()["orders"]
        assert board[0]["number"] == 501
        assert board[0]["status"] == "preparing"

    def test_gost_vidit_nomer_srazu(self, client):
        """Открытые заказы на табло не показываются — раньше номер появлялся
        только после нажатия кассира."""
        import db

        db.ingest_iiko_order(502)
        nomera = [o["number"] for o in client.get("/api/status").json()["orders"]
                  if o["status"] in ("preparing", "ready")]
        assert 502 in nomera

    def test_vremya_ne_pripisyvaetsya_otkrytomu(self, client, staff):
        """Время должно лечь в «готовится», а не в «открытый».

        Проверяем именно первый статус в пути заказа, а не длительность
        «открытого». Прежняя версия теста смотрела на неё — и была зелёной даже
        со сломанным поведением: в тесте заказ переводят в «готово» в ту же
        секунду, так что в «открытом» и при заведении открытым выходит ноль.
        """
        import db

        db.ingest_iiko_order(503)
        client.post("/api/order/status", json={"number": 503, "status": "ready"},
                    headers=staff)
        zakaz = next(o for o in db.stats_orders([db.today()])["orders"]
                     if o["number"] == 503)
        assert zakaz["timeline"][0]["status"] == "preparing", \
            f"заказ из iiko должен начинаться с «готовится»: {zakaz['timeline']}"
        assert not zakaz["openSec"], f"в «открытом» ничего не должно быть: {zakaz}"

    def test_staryj_otkrytyj_zakaz_prodolzhaet_rabotat(self, client, staff):
        """В базе есть заказы, заведённые «открытыми», и они не должны сломаться."""
        import sqlite3

        from config import settings

        db_path = settings.db_path
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "INSERT INTO orders (date, number, status, created_at, updated_at, source)"
                " VALUES (?, ?, 'open', ?, ?, 'iiko')",
                (__import__("db").today(), 504, "2026-08-26T12:00:00", "2026-08-26T12:00:00"),
            )
        board = client.get("/api/status").json()["orders"]
        assert any(o["number"] == 504 and o["status"] == "open" for o in board)
        r = client.post("/api/order/status", json={"number": 504, "status": "preparing"},
                        headers=staff)
        assert r.status_code == 200
