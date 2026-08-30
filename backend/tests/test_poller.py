"""Поллер заказов: переживает сбои кассы и молчит в чат.

Про молчание отдельно, потому что история длинная и её легко откатить назад по
незнанию. 18.08.2026 заказы час не доезжали до табло, и знал об этом только
кассир у стойки — 23.08 в ответ появилась тревога в рабочий чат. Дальше её
дважды чинили: порог перевели с числа тиков на время, потом добавили окно
устойчивой связи, потому что 27.08 касса не оборвалась, а замигала, и за утро в
чат ушло девять сообщений про одну поломку.

После чего выяснилось, что вся ветка лишняя: о молчащей кассе сообщает сама
касса, и наше сообщение дублировало чужое. Тревогу убрали совсем (решение
Арслана и Ильдара, 27.08.2026), разбор поломок остался в логе.
"""

import asyncio

import iiko_poller
import notify


def _prognat(monkeypatch, oshibok, vsego_tikov, pauza=0.01):
    """Прокрутить цикл поллера с подменённой сетью.

    Возвращает `(отправленные сообщения, число обращений к кассе)`.
    """
    otpravleno = []
    obrashcheniy = {"n": 0}

    async def fake_send(text, targets):
        otpravleno.append(text)
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

    async def fake_poll(client):
        i = obrashcheniy["n"]
        obrashcheniy["n"] += 1
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
    return otpravleno, obrashcheniy["n"]


def test_dolgoe_molchanie_kassy_ne_pishet_v_chat(monkeypatch):
    """Даже когда касса молчит все тики подряд, в чат не уходит ничего."""
    soobshcheniya, _ = _prognat(monkeypatch, lambda i: True, vsego_tikov=30)
    assert soobshcheniya == [], f"поллер не должен писать в чат: {soobshcheniya}"


def test_miganie_svyazi_ne_pishet_v_chat(monkeypatch):
    """Рваная связь — тот случай, что 27.08 залил чат девятью сообщениями."""
    soobshcheniya, _ = _prognat(monkeypatch, lambda i: i % 3 != 0, vsego_tikov=30)
    assert soobshcheniya == [], f"мигание не повод писать: {soobshcheniya}"


def test_sboy_ne_ronyaet_cikl(monkeypatch):
    """Главное свойство поллера: тик упал — цикл живёт дальше.

    Без этого одна ошибка кассы навсегда оставила бы табло без заказов, и
    чинилось бы это только перезапуском контейнера.
    """
    _, obrashcheniy = _prognat(monkeypatch, lambda i: i < 10, vsego_tikov=20)
    assert obrashcheniy > 10, (
        f"после серии ошибок поллер обязан продолжить опрос, обращений: {obrashcheniy}"
    )


def test_net_mertvyh_ruchek_trevogi():
    """Убранная тревога не должна оставить за собой мёртвый код.

    Проверяем и старые имена: к порогу возвращались дважды, и оба раза он
    менял смысл. Если ветку захотят вернуть — пусть возвращают осознанно.
    """
    assert not hasattr(notify, "notify_poller_down")
    assert not hasattr(notify, "notify_poller_back")
    assert not hasattr(iiko_poller, "ALERT_AFTER_SEC")
    assert not hasattr(iiko_poller, "RECOVERY_OK_SEC")
    assert not hasattr(iiko_poller, "FAILS_BEFORE_ALERT")
