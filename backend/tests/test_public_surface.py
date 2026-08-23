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
            "/api/history", "/api/events", "/api/stats/days", "/api/stats/range",
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
