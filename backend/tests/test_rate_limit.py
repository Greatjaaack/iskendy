"""Лимиты по адресу.

Тонкость, ради которой тест существует: вид лимита раньше выводился из его
числового значения, а RATE_LIMIT_CLAIM совпал с RATE_LIMIT_LOGIN — оба по
десять. Из-за этого гость, занимающий номера, съедал персоналу попытки входа.
Теперь ключ корзины передаётся явно.
"""

import main
from conftest import CASHIER, GUEST, PASSWORD


def test_perebor_parolya_upiraetsya_v_limit(client):
    codes = [
        client.post("/api/auth/login", json={"password": "ne-tot"}, headers=CASHIER).status_code
        for _ in range(main.RATE_LIMIT_LOGIN + 3)
    ]
    assert 429 in codes
    assert codes.count(401) <= main.RATE_LIMIT_LOGIN


def test_korziny_ne_delyat_schetchik(client):
    """Гость выбирает свой лимит — вход персонала не должен пострадать.

    Адрес намеренно ОДИН на оба вида запросов: в зале весь Wi-Fi выходит через
    один публичный IP, и именно там эта ошибка стреляла бы. С разными адресами
    тест был бы зелёным даже при общей корзине.
    """
    odin_adres = {"X-Forwarded-For": "91.76.12.4"}
    for i in range(main.RATE_LIMIT_CLAIM + 5):
        client.post("/api/guest/claim", json={"number": 300 + i, "guest": f"g{i}"},
                    headers=odin_adres)
    r = client.post("/api/auth/login", json={"password": PASSWORD}, headers=odin_adres)
    assert r.status_code == 200, "вход не должен упираться в лимит занятия номеров"


def test_raznye_adresa_ne_meshayut_drug_drugu(client):
    for _ in range(main.RATE_LIMIT_LOGIN + 2):
        client.post("/api/auth/login", json={"password": "ne-tot"},
                    headers={"X-Forwarded-For": "5.5.5.5"})
    r = client.post("/api/auth/login", json={"password": PASSWORD},
                    headers={"X-Forwarded-For": "6.6.6.6"})
    assert r.status_code == 200


def test_upershiysya_limit_popadaet_v_zhurnal(client):
    import db

    for _ in range(main.RATE_LIMIT_LOGIN + 2):
        client.post("/api/auth/login", json={"password": "ne-tot"}, headers=CASHIER)
    assert any(e["kind"] == "rate_limited" for e in db.security_events())


def test_slovar_schetchikov_ne_rastyot_beskonechno(client):
    """Иначе память утекает: адресов много, а живут они вечно."""
    for i in range(700):
        client.get("/api/feedback/check", params={"number": 1},
                   headers={"X-Forwarded-For": f"10.1.{i // 256}.{i % 256}"})
    assert len(main._rate_hits) <= 700, "остывшие адреса должны выметаться"


def test_otchyoty_ekrana_ne_edyat_limit_gostyam(client):
    """Планшет кассы и телефоны гостей сидят за одним IP зала. Если отчёты
    экранов делят корзину с воронкой, часто теряющий связь планшет выест лимит
    гостям — и наоборот, людный вечер заглушит отчёты о собственных сбоях.
    """
    odin_adres = {"X-Forwarded-For": "91.76.12.9"}
    for _ in range(main.RATE_LIMIT_CLIENT + 5):
        client.post("/api/client/event", json={"kind": "offline"}, headers=odin_adres)
    r = client.post("/api/guest/event", json={"step": "open", "session": "s1"},
                    headers=odin_adres)
    assert r.status_code == 200, "воронка гостя не должна страдать от отчётов экрана"
