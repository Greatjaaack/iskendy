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
    assert "все выданы" in text
    assert "Готовка:" in text


def test_ohvat_pishetsya_drobyu_a_ne_procentom(client, staff):
    """1 оценка на 222 заказа округлялась в «0%» и читалась как «никто не
    оценил» — то есть цифра, ради которой строка существует, пропадала."""
    import db

    _den(client, staff, nomerov=50, ocenka=5)
    text = digest.build_text(db.today())
    assert "Охват: 1 из 50 заказов" in text
    assert "0%" not in text


def test_procent_poyavlyaetsya_kogda_osmyslen(client, staff):
    import db

    _den(client, staff, nomerov=2, ocenka=5)
    text = digest.build_text(db.today())
    assert "(50%)" in text


def test_bez_ocenok_govorim_pryamo(client, staff):
    import db

    _den(client, staff, nomerov=5)
    text = digest.build_text(db.today())
    assert "Оценок нет" in text


def test_negativ_vydelyaetsya(client, staff):
    import db

    _den(client, staff, nomerov=5, ocenka=2)
    text = digest.build_text(db.today())
    assert "Недовольных: 1" in text


def test_sobytiya_bezopasnosti_popadayut_v_svodku(client, staff, served_order):
    import db

    client.post("/api/feedback", json={"number": served_order, "rating": 1},
                headers=STRANGER)
    text = digest.build_text(db.today())
    assert "Безопасность:" in text
    assert "чужих отзывов" in text


def test_spokoynyj_den_bez_stroki_bezopasnosti(client, staff):
    """Успешный вход — не происшествие, и в сводке ему не место."""
    import db

    _den(client, staff, nomerov=2)
    text = digest.build_text(db.today())
    assert "Безопасность:" not in text


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
