"""Когда поллер поднимает тревогу о молчащей кассе.

18 августа заказы час не доезжали до табло, и знал об этом только кассир у
стойки: поллер по замыслу не роняет цикл на ошибке тика, пишет WARNING и идёт
дальше, а лог никто не читает в реальном времени.

Но и на каждый чих тревожить нельзя. У аналитики бывают короткие обрывы связи
с iiko, и почти все проходят сами — 93% её сбоев приходятся на рабочие часы и
длятся секунды. Сообщение на каждый такой эпизод приучит смену не читать чат.
"""

import asyncio

import iiko_poller
import notify

# Порог в тестах крошечный, а не три минуты: проверяем логику «дольше порога»,
# а не конкретное число. Часы при этом настоящие — подменять time.monotonic
# нельзя, под ним работает и сам event loop asyncio.
PORODG_SEC = 0.05


def _prognat(monkeypatch, oshibok, vsego_tikov, porog=PORODG_SEC, pauza=0.02):
    """Прокрутить цикл поллера с подменённой сетью. Возвращает сообщения."""
    otpravleno = []

    async def fake_send(text, targets):
        otpravleno.append(text.split("\n")[0])
        return 1

    from config import settings

    monkeypatch.setattr(notify, "send_message", fake_send)
    monkeypatch.setattr(notify, "THROTTLE_WINDOW_SEC", 0)
    notify._throttle.clear()
    monkeypatch.setattr(settings, "telegram_bot_token", "fake")
    monkeypatch.setattr(settings, "telegram_alert_targets", "-100:858")
    monkeypatch.setattr(settings, "iiko_orders_url", "http://analytics/api/orders/today")
    monkeypatch.setattr(settings, "iiko_internal_token", "t")
    monkeypatch.setattr(settings, "iiko_poll_seconds", pauza)
    monkeypatch.setattr(iiko_poller, "ALERT_AFTER_SEC", porog)

    nomer = {"i": 0}

    async def fake_poll(client):
        i = nomer["i"]
        nomer["i"] += 1
        if i >= vsego_tikov:
            raise asyncio.CancelledError
        if oshibok(i):
            raise RuntimeError("500 Internal Server Error")

    monkeypatch.setattr(iiko_poller, "_poll_once", fake_poll)

    async def main():
        try:
            await asyncio.wait_for(iiko_poller.run_poller(), timeout=10)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    asyncio.run(main())
    return otpravleno


def test_korotkiy_sboy_ne_trevozhit(monkeypatch):
    """Одна-две неудачи короче порога — обычная рябь, молчим."""
    soobshcheniya = _prognat(monkeypatch, lambda i: i < 1, vsego_tikov=5, porog=5.0)
    assert soobshcheniya == [], f"не должно быть сообщений: {soobshcheniya}"


def test_dolgoe_molchanie_trevozhit(monkeypatch):
    soobshcheniya = _prognat(monkeypatch, lambda i: i < 8, vsego_tikov=14)
    assert any("не приезжают" in s for s in soobshcheniya), soobshcheniya


def test_est_razvyazka_posle_vosstanovleniya(monkeypatch):
    """Тревога без сообщения о том, что всё починилось, хуже её отсутствия."""
    soobshcheniya = _prognat(monkeypatch, lambda i: i < 8, vsego_tikov=14)
    assert any("снова приезжают" in s for s in soobshcheniya), soobshcheniya


def test_trevozhim_odin_raz_a_ne_kazhdyj_tik(monkeypatch):
    soobshcheniya = _prognat(monkeypatch, lambda i: i < 20, vsego_tikov=22)
    trevog = [s for s in soobshcheniya if "не приезжают" in s]
    assert len(trevog) == 1, f"тревога должна быть одна: {soobshcheniya}"


def test_serii_ne_skladyvayutsya(monkeypatch):
    """Две короткие серии с успехом между ними — не одна длинная."""
    # ошибки, потом успех, потом снова ошибки; каждая серия короче порога
    soobshcheniya = _prognat(
        monkeypatch, lambda i: i != 2 and i < 5, vsego_tikov=8, porog=5.0
    )
    assert soobshcheniya == [], f"серии не должны складываться: {soobshcheniya}"


def test_porog_zadan_vremenem_a_ne_chislom_tikov():
    """Раньше стояло «пять тиков» с комментарием «это две с половиной минуты при
    опросе раз в 30 секунд». На проде опрос идёт раз в 10 секунд, то есть
    тревога уходила через 50 секунд — втрое раньше задуманного. Порог, привязанный
    к числу попыток, тихо меняет смысл при каждой правке периода опроса."""
    assert not hasattr(iiko_poller, "FAILS_BEFORE_ALERT")
    assert iiko_poller.ALERT_AFTER_SEC == 180
