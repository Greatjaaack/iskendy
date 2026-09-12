"""Что видно и что можно снаружи, без токена персонала."""

from conftest import GUEST, STRANGER


class TestQr:
    """Ручка открытая — QR табло рисуется гостям. Раньше она принимала любую
    строку, и получался генератор QR на чужой сайт, отдаваемый с домена
    ресторана: готовая листовка «оплатите заказ» с честной проверкой источника.
    """

    def test_svoy_otnositelnyj_put(self, client):
        r = client.get("/api/qr", params={"data": "/board"})
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/svg+xml"

    def test_svoy_polnyj_adres(self, client):
        r = client.get("/api/qr", params={"data": "http://testserver/board"})
        assert r.status_code == 200

    def test_chuzhoy_sayt_otklonyaetsya(self, client):
        r = client.get("/api/qr", params={"data": "https://fishing.example/pay"})
        assert r.status_code == 400

    def test_protokol_javascript_otklonyaetsya(self, client):
        r = client.get("/api/qr", params={"data": "javascript:alert(1)"})
        assert r.status_code == 400

    def test_protokolnaya_ssylka_na_chuzhoy_host(self, client):
        """«//evil.example/x» браузер трактует как чужой адрес."""
        r = client.get("/api/qr", params={"data": "//evil.example/x"})
        assert r.status_code == 400


class TestCheck:
    def test_ne_otdayot_vnutrenniy_orderid(self, client, served_order):
        """orderId сквозной по всей истории: по его приросту считался бы оборот."""
        body = client.get("/api/feedback/check", params={"number": served_order}).json()
        assert body["ok"] is True
        assert "orderId" not in body

    def test_neizvestnyj_nomer(self, client):
        body = client.get("/api/feedback/check", params={"number": 99999}).json()
        assert body["reason"] == "not_found"
        assert "orderId" not in body


class TestZakrytye:
    """Всё, что показывает данные заведения, требует токена."""

    def test_bez_tokena_nelzya(self, client):
        zakrytye = [
            "/api/events", "/api/stats/days", "/api/stats/range",
            "/api/stats/orders", "/api/stats/guest", "/api/stats/feedback",
            "/api/feedback/list", "/api/backup/list", "/api/backup/latest",
            "/api/security/events", "/api/security/summary", "/api/auth/session",
        ]
        for path in zakrytye:
            assert client.get(path).status_code == 401, path

    def test_otkrytye_otvechayut(self, client):
        for path in ("/api/health", "/api/status", "/api/feedback/config"):
            assert client.get(path).status_code == 200, path


def test_zashchitnye_zagolovki_na_meste(client):
    h = client.get("/api/health").headers
    assert h["X-Frame-Options"] == "SAMEORIGIN"
    assert h["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'self'" in h["Content-Security-Policy"]
    assert "object-src 'none'" in h["Content-Security-Policy"]


class TestGostNeVidetNepoladok:
    """Гость пришёл за едой, а не за нашими неполадками: красная надпись «нет
    связи» на его телефоне или на телевизоре в зале читается как «тут всё
    сломалось». Плашка обрыва разрешена только кассе.
    """

    def _front(self):
        from pathlib import Path
        return (Path(__file__).resolve().parents[2] / "frontend" / "index.html").read_text()

    def test_plashka_pokazyvaetsya_tolko_na_kasse(self):
        html = self._front()
        nachalo = html.index("function showOfflineBar()")
        telo = html[nachalo:nachalo + 600]
        assert "staff-view" in telo, (
            "showOfflineBar обязана проверять, что экран кассовый — "
            "иначе плашку увидит гость"
        )

    def test_net_otdelnogo_stilya_dlya_televizora(self):
        """Крупный стиль плашки под ТВ означал бы, что её там показывают."""
        assert "body.tv .offline-bar" not in self._front()

    def test_nazhatiya_kassy_ne_glotayut_oshibku(self):
        """Пустой .catch() у кнопок кассы означает, что при обрыве связи
        нажатие исчезает бесследно: заказ не двигается, экран молчит, причину
        взять неоткуда. Ошибка обязана доходить до кассира.
        """
        html = self._front()
        for deystvie in ("/api/order/status", "/api/order/delete", "/api/day/reset"):
            kusok = html[html.index(deystvie):html.index(deystvie) + 400]
            assert ".catch(() => {})" not in kusok, (
                f"{deystvie}: ошибка нажатия проглочена"
            )

    def test_setevaya_oshibka_obyasnena_po_russki(self):
        """«Failed to fetch» кассиру ничего не говорит — нужен понятный текст
        и прямое указание, что нажатие не сохранилось."""
        html = self._front()
        assert "проверьте интернет на планшете. Ничего не сохранено." in html
