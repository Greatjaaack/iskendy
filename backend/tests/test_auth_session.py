"""Касса открыта на одном устройстве.

Планшет стоит за столом залогиненным месяцами — пароль вводить неудобно, оттого
и долгий токен. Значит второй вход тем же паролем это не «хозяин зашёл с
телефона», а сигнал об утечке: пароль один и открывает всё, включая контакты
гостей и выгрузку базы.
"""

from conftest import CASHIER, PASSWORD, STRANGER


def test_vhod_s_vernym_parolem(client):
    r = client.post("/api/auth/login", json={"password": PASSWORD}, headers=CASHIER)
    assert r.status_code == 200
    assert r.json()["token"]


def test_nevernyj_parol(client):
    r = client.post("/api/auth/login", json={"password": "ne-tot"}, headers=CASHIER)
    assert r.status_code == 401


def test_vtoroy_vhod_otklonyaetsya(client, staff):
    r = client.post("/api/auth/login", json={"password": PASSWORD}, headers=STRANGER)
    assert r.status_code == 409
    assert "другом устройстве" in r.json()["detail"]


def test_planshet_pri_etom_prodolzhaet_rabotat(client, staff):
    """Смена не должна остаться без кассы из-за чужой попытки войти."""
    client.post("/api/auth/login", json={"password": PASSWORD}, headers=STRANGER)
    assert client.get("/api/stats/days", headers=staff).status_code == 200


def test_vyhod_ubivaet_token(client, staff):
    assert client.post("/api/auth/logout", headers=staff).status_code == 200
    assert client.get("/api/stats/days", headers=staff).status_code == 401


def test_posle_vyhoda_kassa_svobodna(client, staff):
    client.post("/api/auth/logout", headers=staff)
    r = client.post("/api/auth/login", json={"password": PASSWORD}, headers=STRANGER)
    assert r.status_code == 200


def test_podpisannyj_token_bez_sessii_ne_rabotaet(client):
    """Подписи мало: сессию должны уметь отзывать, не дожидаясь конца срока."""
    from auth import issue_token

    token, _ = issue_token()
    r = client.get("/api/stats/days", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_musor_vmesto_tokena_daet_401_a_ne_500(client):
    """Кириллицы в заголовке быть не может — HTTP этого не позволяет, httpx
    отказывается отправлять такой запрос. Проверяем то, что реально долетает:
    обрезанный токен, лишние точки, чужая схема, мусор в подписи."""
    plohie = (
        "Bearer",
        "Bearer ...",
        "Bearer a.b.c.d",
        "Bearer eyJhbGciOiAiSFMyNTYifQ.e30.podpis",
        "",
        "Basic xxx",
        "bearer lowercase",
    )
    for bad in plohie:
        r = client.get("/api/stats/days", headers={"Authorization": bad})
        assert r.status_code == 401, bad


def test_parol_v_russkoy_raskladke_daet_401_a_ne_500(client):
    """Гость набирает пароль не в той раскладке — это неверный пароль, а не сбой
    сервера. Когда-то здесь был 500: hmac.compare_digest не принимает не-ASCII."""
    r = client.post("/api/auth/login", json={"password": "фвьшш_181"}, headers=CASHIER)
    assert r.status_code == 401


def test_sobytiya_vhoda_v_zhurnale(client, staff):
    import db

    client.post("/api/auth/login", json={"password": "ne-tot"}, headers=STRANGER)
    client.post("/api/auth/login", json={"password": PASSWORD}, headers=STRANGER)
    kinds = [e["kind"] for e in db.security_events()]
    assert "login_ok" in kinds
    assert "login_failed" in kinds
    assert "login_blocked" in kinds


def test_otklonyonnyj_vhod_gotovit_uvedomlenie(client, staff, _clean_state):
    """Владелец должен узнать, что пароль подошёл кому-то ещё."""
    client.post("/api/auth/login", json={"password": PASSWORD}, headers=STRANGER)
    # send_message подменён заглушкой; адресатов в тестах нет, поэтому проверяем
    # сам факт, что ветка отработала и запись о попытке появилась.
    import db

    assert any(e["kind"] == "login_blocked" for e in db.security_events())
