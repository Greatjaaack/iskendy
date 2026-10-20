"""Сообщение управляющему и вложения к отзыву (контракт — docs/48 фронта).

Файлы не хранятся: уходят в тему отзывов. Главное правило — гостю нельзя
ответить «отправлено», если хоть что-то не дошло: тогда фронт оставит черновик.
"""

import pytest
from conftest import GUEST

import main
import notify

PHOTO = ("dyurum.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")


@pytest.fixture
def chat(monkeypatch):
    """Telegram настроен: тема отзывов -100:800."""
    from config import settings

    monkeypatch.setattr(settings, "telegram_bot_token", "fake")
    monkeypatch.setattr(settings, "feedback_alert_enabled", True)
    monkeypatch.setattr(settings, "telegram_feedback_targets", "-100:800")


def _message(client, text="Дюрюм холодный", number="25", files=(PHOTO,)):
    return client.post(
        "/api/guest/message",
        data={"text": text, "number": number},
        files=[("files", f) for f in files],
        headers=GUEST,
    )


def test_soobshchenie_s_foto_uhodit_v_temu_otzyvov(client, chat, _clean_state):
    r = _message(client)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    foto, tekst = _clean_state
    assert foto[1] == [("-100", 800)] and foto[2] == "dyurum.jpg"
    assert "заказ №25" in foto[0] and "1/1" in foto[0]
    assert "«Дюрюм холодный»" in tekst[0] and "Вложений: 1" in tekst[0]


def test_tekst_ekraniruetsya(client, chat, _clean_state):
    _message(client, text="<b>взлом</b>", files=())
    assert "&lt;b&gt;взлом" in _clean_state[-1][0]


def test_bez_teksta_ne_prinimaem(client, chat, _clean_state):
    assert _message(client, text="  ").status_code == 422
    assert _clean_state == []


@pytest.mark.parametrize(
    "file, code",
    [
        (("virus.exe", b"MZ", "application/x-msdownload"), 415),
        (("pusto.jpg", b"", "image/jpeg"), 400),
    ],
)
def test_chuzhie_i_pustye_fajly_otklonyaem(client, chat, file, code, _clean_state):
    assert _message(client, files=(file,)).status_code == code
    assert _clean_state == []


def test_bolshoj_fajl_otklonyaem(client, chat, monkeypatch, _clean_state):
    monkeypatch.setattr(main, "GUEST_FILE_MAX_BYTES", 50)
    assert _message(client).status_code == 413
    assert _clean_state == []


def test_ne_bolshe_pyati_fajlov(client, chat, _clean_state):
    assert _message(client, files=(PHOTO,) * 6).status_code == 400
    assert _clean_state == []


def test_bez_telegram_chestnyj_otkaz(client, _clean_state):
    """Telegram не настроен — не «отправлено», а 503: черновик останется у гостя."""
    assert _message(client).status_code == 503


def test_poteryannoe_foto_ne_vydayotsya_za_uspeh(client, chat, monkeypatch):
    async def _fail(*_args):
        return False

    monkeypatch.setattr(notify, "send_file", _fail)
    assert _message(client).status_code == 503


def test_limit_pyat_v_minutu(client, chat):
    codes = [_message(client, files=()).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]


def _rated(client, staff):
    client.post("/api/order", json={"number": 42}, headers=staff)
    client.post("/api/order/status", json={"number": 42, "status": "served"}, headers=staff)
    claim = client.post(
        "/api/guest/claim", json={"number": 42, "guest": "ali"}, headers=GUEST
    ).json()["claimToken"]
    return client.post(
        "/api/feedback",
        json={"number": 42, "rating": 2, "claim_token": claim},
        headers=GUEST,
    ).json()


def test_foto_k_svoemu_otzyvu(client, staff, chat, _clean_state):
    fb = _rated(client, staff)
    _clean_state.clear()
    r = client.post(
        "/api/feedback/files",
        data={"feedback_id": fb["feedbackId"], "edit_token": fb["editToken"]},
        files=[("files", PHOTO)],
        headers=GUEST,
    )
    assert r.json() == {"ok": True}
    assert "заказ №42" in _clean_state[0][0]
    assert "Оценка 2★" in _clean_state[-1][0]


def test_foto_k_chuzhomu_otzyvu_nelzya(client, staff, chat, _clean_state):
    fb = _rated(client, staff)
    _clean_state.clear()
    r = client.post(
        "/api/feedback/files",
        data={"feedback_id": fb["feedbackId"], "edit_token": "podobrannyj"},
        files=[("files", PHOTO)],
        headers=GUEST,
    )
    assert r.json()["reason"] == "wrong_token"
    assert _clean_state == []
