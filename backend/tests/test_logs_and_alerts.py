"""Логи и уведомления: что пишется, что не пишется, что не спамит."""

import asyncio
import logging

import notify
from conftest import CASHIER, GUEST


class TestAccessLog:
    """Опрос табло давал 92% строк лога (109 278 из 119 231 за пять дней), и
    полезное в этом шуме не находилось. Но ошибки от тех же путей нужны всегда.
    """

    def test_opros_tablo_ne_pishetsya(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="access"):
            client.get("/api/status")
            client.get("/api/health")
        assert caplog.records == []

    def test_deystvie_kassy_pishetsya(self, client, staff, caplog):
        with caplog.at_level(logging.INFO, logger="access"):
            client.post("/api/order", json={"number": 42}, headers=staff)
        stroki = [r.getMessage() for r in caplog.records]
        assert any("POST /api/order 200" in s for s in stroki)

    def test_v_stroke_est_nastoyashchiy_adres(self, client, staff, caplog):
        with caplog.at_level(logging.INFO, logger="access"):
            client.post("/api/order", json={"number": 42}, headers=staff)
        stroki = " ".join(r.getMessage() for r in caplog.records)
        assert "178.66.4.10" in stroki, "должен быть адрес гостя, а не Caddy"

    def test_oshibka_na_tihom_puti_vsyo_ravno_pishetsya(self, client, caplog):
        with caplog.at_level(logging.INFO, logger="access"):
            client.get("/api/qr", params={"data": "https://fishing.example/pay"})
        stroki = " ".join(r.getMessage() for r in caplog.records)
        assert "400" in stroki


class TestSchlopyvanie:
    """Лимит пропускает десять попыток входа в минуту — шестьсот в час. Без
    схлопывания тема аварий превратилась бы в стену одинаковых строк, человек
    замьютил бы её и перестал видеть настоящие поломки.
    """

    def test_povtory_ne_letyat_kazhdyj_raz(self, monkeypatch):
        otpravleno = []

        async def _capture(text, targets):
            otpravleno.append(text)
            return 1

        monkeypatch.setattr(notify, "send_message", _capture)
        notify._throttle.clear()

        async def scenariy():
            targets = [("-100", 858)]
            for _ in range(25):
                await notify.send_throttled("login_blocked", "Отклонён вход", targets)

        asyncio.run(scenariy())
        assert len(otpravleno) == 1, "25 попыток должны дать одно сообщение"

    def test_posle_okna_dosylaetsya_schyot(self, monkeypatch):
        otpravleno = []

        async def _capture(text, targets):
            otpravleno.append(text)
            return 1

        monkeypatch.setattr(notify, "send_message", _capture)
        monkeypatch.setattr(notify, "THROTTLE_WINDOW_SEC", 0.05)
        notify._throttle.clear()

        async def scenariy():
            targets = [("-100", 858)]
            for _ in range(8):
                await notify.send_throttled("claim_anomaly", "Аномалия", targets)
            await asyncio.sleep(0.2)

        asyncio.run(scenariy())
        assert len(otpravleno) == 2
        assert "ещё 7" in otpravleno[1]


class TestMarshrutizaciya:
    """Две темы рабочего чата: отзывы отдельно, аварии отдельно. Личных
    адресатов нет — система должна работать без владельца.
    """

    def test_obe_vetki_otzyvov_idut_v_temu_otzyvov(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "telegram_bot_token", "fake")
        monkeypatch.setattr(settings, "feedback_alert_enabled", True)
        monkeypatch.setattr(settings, "feedback_notify_all", True)
        monkeypatch.setattr(settings, "telegram_feedback_targets", "-100:800")
        monkeypatch.setattr(settings, "telegram_alert_targets", "-100:858")
        assert notify.targets_for("negative") == [("-100", 800)]
        assert notify.targets_for("positive") == [("-100", 800)]

    def test_sboi_idut_v_temu_avariy(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "telegram_bot_token", "fake")
        monkeypatch.setattr(settings, "telegram_alert_targets", "-100:858")
        assert notify._security_targets() == [("-100", 858)]

    def test_sboi_ne_glushatsya_rubilnikom_otzyvov(self, monkeypatch):
        """Узнать, что кассу пытались открыть, важнее потока оценок."""
        from config import settings

        monkeypatch.setattr(settings, "telegram_bot_token", "fake")
        monkeypatch.setattr(settings, "feedback_alert_enabled", False)
        monkeypatch.setattr(settings, "telegram_alert_targets", "-100:858")
        assert notify.targets_for("negative") == []
        assert notify._security_targets() == [("-100", 858)]

    def test_bez_tokena_molchim(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "telegram_bot_token", "")
        assert notify._security_targets() == []
        assert notify.targets_for("negative") == []


def test_tekst_otzyva_ekraniruetsya_dlya_telegram(monkeypatch):
    """Гость пишет что угодно, а сообщение уходит с parse_mode=HTML."""
    fb = {"rating": 2, "number": 42, "waitSeconds": 600,
          "comment": "<b>жирно</b> & <script>alert(1)</script>", "tags": "остыло"}
    text = notify.format_feedback(fb, "negative")
    assert "<script>" not in text
    assert "&lt;script&gt;" in text


class TestOtchyotEkrana:
    """Планшет кассы, потерявший сеть, в логах сервера не оставляет ничего: он
    просто перестаёт приходить. 12.09.2026 экран провисел так с 18:19 до
    закрытия, и 87 заказов остались неотмеченными. Теперь клиент, вернувшись на
    связь, докладывает о разрыве сам.
    """

    def test_otchyot_ob_obryve_popadaet_v_log(self, client, caplog):
        with caplog.at_level(logging.WARNING, logger="site"):
            r = client.post("/api/client/event", json={
                "kind": "offline", "screen": "/staff",
                "detail": "экран был без связи 240 с",
            })
        assert r.status_code == 200
        stroka = " ".join(rec.getMessage() for rec in caplog.records)
        assert "/staff" in stroka and "offline" in stroka
        assert "240" in stroka, "длительность разрыва должна попасть в лог"

    def test_upavshiy_skript_tozhe_pishetsya(self, client, caplog):
        with caplog.at_level(logging.WARNING, logger="site"):
            client.post("/api/client/event", json={
                "kind": "js", "screen": "/tv", "detail": "x is not defined @ /:12",
            })
        stroka = " ".join(rec.getMessage() for rec in caplog.records)
        assert "js" in stroka and "not defined" in stroka

    def test_ruchka_otkryta_bez_tokena(self, client):
        """Её зовут и телевизор, и телефон гостя — токена у них нет."""
        assert client.post("/api/client/event",
                           json={"kind": "offline"}).status_code == 200

    def test_dlinnyy_detail_obrezaetsya(self, client):
        """Лог — общий ресурс: в него нельзя залить роман с устройства."""
        r = client.post("/api/client/event",
                        json={"kind": "js", "detail": "я" * 5000})
        assert r.status_code == 422, "слишком длинный detail не принимаем"


class TestZapasnyeProxy:
    """Арендованный прокси — расходник. 09.09.2026 он умер, и вместе с ним
    замолчало всё: вечерние сводки и аварии сторожа, двое суток. Один адрес в
    настройке означает ровно одну точку отказа, поэтому их теперь список.
    """

    def _fake_httpx(self, monkeypatch, upali: set[str], popytki: list):
        """Клиент, у которого названные прокси не отвечают."""
        import httpx

        class FakeResp:
            status_code = 200
            text = "ok"

        class FakeClient:
            def __init__(self, proxy=None, **kw):
                self.proxy = proxy

            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False

            async def post(self, *a, **kw):
                popytki.append(self.proxy)
                if self.proxy in upali:
                    raise httpx.ConnectTimeout("")
                return FakeResp()

        monkeypatch.setattr(httpx, "AsyncClient",
                            lambda **kw: FakeClient(**kw))

    def test_upal_pervyy_uhodit_cherez_vtoroy(self, monkeypatch):
        from config import settings

        pervyy, vtoroy = "http://u:p@10.0.0.1:8000", "http://u:p@10.0.0.2:8000"
        monkeypatch.setattr(settings, "bot_proxy_url", f"{pervyy}, {vtoroy}")
        monkeypatch.setattr(settings, "telegram_bot_token", "123:ABC")
        monkeypatch.setattr(notify, "_zhivoy_proxy", None)
        popytki: list = []
        self._fake_httpx(monkeypatch, {pervyy}, popytki)

        # send_message в тестах подменён заглушкой (conftest), поэтому зовём
        # саму доставку: проверяем именно перебор адресов.
        ok = asyncio.run(notify._deliver("http://api/x", {"chat_id": "-100"}, "-100"))
        assert ok, "сообщение обязано уйти через запасной адрес"
        assert popytki == [pervyy, vtoroy]

    def test_rabochiy_proksi_probuem_pervym(self, monkeypatch):
        """Иначе каждая отправка начинается с таймаута на мёртвом адресе."""
        from config import settings

        pervyy, vtoroy = "http://u:p@10.0.0.1:8000", "http://u:p@10.0.0.2:8000"
        monkeypatch.setattr(settings, "bot_proxy_url", f"{pervyy},{vtoroy}")
        monkeypatch.setattr(settings, "telegram_bot_token", "123:ABC")
        monkeypatch.setattr(notify, "_zhivoy_proxy", vtoroy)
        assert notify.proxy_list()[0] == vtoroy

    def test_otvet_telegrama_ne_povod_menyat_proksi(self, monkeypatch):
        """Код 400 — это про чат или токен. Повтор разослал бы дубли."""
        import httpx
        from config import settings

        pervyy, vtoroy = "http://u:p@10.0.0.1:8000", "http://u:p@10.0.0.2:8000"
        monkeypatch.setattr(settings, "bot_proxy_url", f"{pervyy},{vtoroy}")
        monkeypatch.setattr(settings, "telegram_bot_token", "123:ABC")
        monkeypatch.setattr(notify, "_zhivoy_proxy", None)
        popytki: list = []

        class FakeResp:
            status_code = 400
            text = "chat not found"

        class FakeClient:
            def __init__(self, proxy=None, **kw): self.proxy = proxy
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, *a, **kw):
                popytki.append(self.proxy)
                return FakeResp()

        monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: FakeClient(**kw))
        assert asyncio.run(notify._deliver("http://api/x", {}, "-100")) is False
        assert popytki == [pervyy], "второй адрес пробовать не должны"

    def test_parol_proksi_ne_popadaet_v_log(self, monkeypatch, caplog):
        from config import settings

        proxy = "http://login:sekret@10.0.0.1:8000"
        monkeypatch.setattr(settings, "bot_proxy_url", proxy)
        monkeypatch.setattr(settings, "telegram_bot_token", "123:ABC")
        monkeypatch.setattr(notify, "_zhivoy_proxy", None)
        self._fake_httpx(monkeypatch, {proxy}, [])

        with caplog.at_level(logging.WARNING, logger="notify"):
            asyncio.run(notify._deliver("http://api/x", {}, "-100"))
        stroki = " ".join(r.getMessage() for r in caplog.records)
        assert "sekret" not in stroki and "login" not in stroki
        assert "10.0.0.1:8000" in stroki, "адрес без пароля знать надо"

    def test_pustaya_nastroyka_znachit_napryamuyu(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "bot_proxy_url", "")
        monkeypatch.setattr(notify, "_zhivoy_proxy", None)
        assert notify.proxy_list() == [None]


class TestFonovyeTsikly:
    """Фоновый цикл, упавший с исключением, исчезает молча: поллер перестаёт
    возить заказы, бэкап перестаёт сниматься, а в логе пусто — исключение
    осталось внутри мёртвой корутины. Плюс задача без сохранённой ссылки может
    быть убита сборщиком мусора.
    """

    def test_upavshiy_tsikl_popadaet_v_log_i_podnimaetsya(self, monkeypatch, caplog):
        import main

        monkeypatch.setattr(main, "FON_RESTART_SEC", 0)
        zapuski = []

        async def padayushchiy():
            zapuski.append(1)
            if len(zapuski) < 3:
                raise RuntimeError("притворяюсь сломанным")
            await asyncio.sleep(3600)   # третий запуск живёт долго

        async def progon():
            with caplog.at_level(logging.WARNING, logger="site"):
                task = main._fon(padayushchiy, "проверка")
                await asyncio.sleep(0.05)
                task.cancel()

        asyncio.run(progon())
        assert len(zapuski) >= 2, "после падения цикл обязан подняться заново"
        stroki = " ".join(r.getMessage() for r in caplog.records)
        assert "проверка" in stroki and "упал" in stroki
        assert "RuntimeError" in stroki, "в логе нужен тип ошибки"

    def test_ssylka_na_zadachu_uderzhivaetsya(self, monkeypatch):
        """Иначе сборщик мусора вправе убить фоновый цикл на ходу."""
        import main

        async def tihiy():
            await asyncio.sleep(3600)

        async def progon():
            task = main._fon(tihiy, "тихий")
            assert task in main._fon_tasks
            task.cancel()

        asyncio.run(progon())

    def test_ostanovka_servisa_ne_schitaetsya_polomkoy(self, monkeypatch, caplog):
        """CancelledError — это выключение, а не авария: паниковать не о чем."""
        import main

        monkeypatch.setattr(main, "FON_RESTART_SEC", 0)

        async def tihiy():
            await asyncio.sleep(3600)

        async def progon():
            with caplog.at_level(logging.WARNING, logger="site"):
                task = main._fon(tihiy, "тихий")
                await asyncio.sleep(0.01)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        asyncio.run(progon())
        assert "упал" not in " ".join(r.getMessage() for r in caplog.records)

    def test_vyklyuchennyy_tsikl_ne_perezapuskaetsya(self, monkeypatch, caplog):
        """run_poller и run_digest_loop штатно возвращаются, когда выключены в
        настройках. Принять это за поломку — значит каждые полминуты писать в
        лог «поднимаю заново» о том, чего не просили запускать.
        """
        import main

        monkeypatch.setattr(main, "FON_RESTART_SEC", 0)
        zapuski = []

        async def vyklyuchennyy():
            zapuski.append(1)
            return

        async def progon():
            with caplog.at_level(logging.INFO, logger="site"):
                await main._fon(vyklyuchennyy, "выключенный")
                await asyncio.sleep(0.02)

        asyncio.run(progon())
        assert zapuski == [1], "повторно запускать выключённый цикл незачем"
        stroki = " ".join(r.getMessage() for r in caplog.records)
        assert "завершён" in stroki and "упал" not in stroki
