"""Отзыв может оставить только тот, кто следил за заказом.

Дыра, которую это закрывает: номер с чека совпадает с номером на телевизоре в
зале, то есть виден всем. Раньше его одного хватало, чтобы отправить оценку, —
любой прохожий мог влепить незнакомому гостю единицу и поднять владельца
алертом. Проверено на живом сайте до починки: сегодняшние номера были доступны.
"""

from conftest import GUEST, STRANGER


def _claim(client, number, guest, headers=GUEST):
    return client.post(
        "/api/guest/claim", json={"number": number, "guest": guest}, headers=headers
    )


def test_chuzhoy_ne_ostavit_otzyv_bez_klyucha(client, served_order):
    r = client.post(
        "/api/feedback", json={"number": served_order, "rating": 1}, headers=STRANGER
    )
    assert r.json()["reason"] == "not_claimed"


def test_chuzhoy_ne_ostavit_otzyv_s_vydumannym_klyuchom(client, served_order):
    _claim(client, served_order, "ali")
    r = client.post(
        "/api/feedback",
        json={"number": served_order, "rating": 1, "claim_token": "podobrannyj"},
        headers=STRANGER,
    )
    assert r.json()["reason"] == "not_claimed"


def test_gost_so_svoim_klyuchom_ostavlyaet_otzyv(client, served_order):
    token = _claim(client, served_order, "ali").json()["claimToken"]
    r = client.post(
        "/api/feedback",
        json={"number": served_order, "rating": 5, "claim_token": token},
        headers=GUEST,
    )
    body = r.json()
    assert body["ok"] is True
    assert body["branch"] == "positive"


def test_nomer_dostayotsya_pervomu(client, served_order):
    assert _claim(client, served_order, "ali").json()["ok"] is True
    vtoroy = _claim(client, served_order, "vandal", headers=STRANGER).json()
    assert vtoroy["ok"] is False
    assert vtoroy["reason"] == "taken"


def test_tot_zhe_telefon_poluchaet_tot_zhe_klyuch(client, served_order):
    """Перезагрузка страницы не должна выглядеть как попытка захвата."""
    first = _claim(client, served_order, "ali").json()["claimToken"]
    second = _claim(client, served_order, "ali").json()["claimToken"]
    assert first == second


def test_odin_zakaz_odin_otzyv(client, served_order):
    token = _claim(client, served_order, "ali").json()["claimToken"]
    body = {"number": served_order, "rating": 5, "claim_token": token}
    assert client.post("/api/feedback", json=body, headers=GUEST).json()["ok"] is True
    povtor = client.post("/api/feedback", json=body, headers=GUEST).json()
    assert povtor["ok"] is False
    assert povtor["reason"] == "already"


def test_ocenit_do_vydachi_nelzya(client, staff):
    client.post("/api/order", json={"number": 7}, headers=staff)
    token = _claim(client, 7, "ali").json()["claimToken"]
    r = client.post(
        "/api/feedback", json={"number": 7, "rating": 5, "claim_token": token},
        headers=GUEST,
    )
    assert r.json()["reason"] == "not_served"


def test_odno_ustroystvo_ne_zaymyot_ves_den(client):
    """Номера идут подряд, поэтому без потолка вредитель занял бы день целиком."""
    import db

    for i in range(db.CLAIM_MAX_PER_GUEST_DAY):
        assert _claim(client, 100 + i, "vandal").json()["ok"] is True
    lishniy = _claim(client, 200, "vandal").json()
    assert lishniy["ok"] is False
    assert lishniy["reason"] == "too_many"


def test_zanyatie_nesushchestvuyushchego_nomera_protuhaet(client):
    """Иначе можно занять номера впрок, до того как их выдаст касса."""
    import sqlite3
    from datetime import datetime, timedelta

    import db
    from config import settings

    assert _claim(client, 555, "vandal").json()["ok"] is True
    staro = datetime.now().replace(microsecond=0) - timedelta(
        minutes=db.CLAIM_PENDING_TTL_MIN + 5
    )
    with sqlite3.connect(settings.db_path) as conn:
        conn.execute(
            "UPDATE order_claims SET created_at = ? WHERE number = 555",
            (staro.isoformat(),),
        )
    assert _claim(client, 555, "chestnyj-gost").json()["ok"] is True


def test_otkaz_popadaet_v_zhurnal_bezopasnosti(client, served_order):
    import db

    client.post(
        "/api/feedback", json={"number": served_order, "rating": 1}, headers=STRANGER
    )
    kinds = [e["kind"] for e in db.security_events()]
    assert "feedback_denied" in kinds
