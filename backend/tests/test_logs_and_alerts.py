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
