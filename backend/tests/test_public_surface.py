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


def test_csp_propuskaet_metriku(client):
    """tag.js грузится с mc.yandex.ru, а хиты шлёт на mc.yandex.com и
    служебные iframe — на mc.yandex.md. До 12.10.2026 CSP пускал только .ru:
    скрипт загружался, а все просмотры и цели молча резались браузером."""
    csp = dict(
        d.strip().split(" ", 1) for d in
        client.get("/api/health").headers["Content-Security-Policy"].split(";")
    )
    for directive in ("script-src", "img-src", "connect-src", "frame-src"):
        for host in ("mc.yandex.ru", "mc.yandex.com", "mc.yandex.md"):
            assert f"https://{host}" in csp[directive], (directive, host)


def test_head_ne_404(client):
    """HEAD шлют мониторинги и `curl -I`. До 13.10.2026 страницы и health были
    только на GET, HEAD проваливался в StaticFiles и получал 404."""
    for path in ("/", "/board", "/tv", "/staff", "/stats", "/api/health"):
        r = client.head(path)
        assert r.status_code == 200, path
        assert r.content == b"", path
        assert "Content-Security-Policy" in r.headers, path
    assert "X-Robots-Tag" not in client.head("/", headers={"host": "iskendy.ru"}).headers
    assert "noindex" in client.head("/board").headers["X-Robots-Tag"]


class TestGostNeVidetNepoladok:
    """Гость пришёл за едой, а не за нашими неполадками: красная надпись «нет
    связи» на его телефоне или на телевизоре в зале читается как «тут всё
    сломалось». Плашка обрыва разрешена только кассе.
    """

    def _front(self):
        """Кассу и ТВ рисует прежний index.html; с новым гостевым фронтом он
        лежит рядом как legacy.html, а index.html становится загрузчиком."""
        from pathlib import Path
        front = Path(__file__).resolve().parents[2] / "frontend"
        legacy = front / "legacy.html"
        return (legacy if legacy.exists() else front / "index.html").read_text()

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


class TestIndexaciya:
    """В поиске только главная iskendy.ru; всё остальное — noindex."""

    def test_glavnaya_indeksiruetsya(self, client):
        r = client.get("/", headers={"Host": "iskendy.ru"})
        assert "x-robots-tag" not in r.headers

    def test_www_zakryt(self, client):
        r = client.get("/", headers={"Host": "www.iskendy.ru"})
        assert "noindex" in r.headers["x-robots-tag"]

    def test_stranicy_i_api_zakryty(self, client):
        for path in ("/board", "/tv", "/staff", "/stats", "/api/health", "/nety-takogo"):
            r = client.get(path, headers={"Host": "iskendy.ru"})
            assert "noindex" in r.headers["x-robots-tag"], path


class TestNovyjGostevojFront:
    """Новый гостевой фронт (iskendy-frontend) кладёт во frontend/ загрузчик
    index.html, прежний экран как legacy.html и бандлы в /app/. Служебные
    экраны должны получать legacy.html сразу: JS-загрузчик на телевизоре в
    Яндекс.Браузере может не завестись вовсе.
    """

    def _front(self, tmp_path, monkeypatch, legacy=True):
        import main
        (tmp_path / "index.html").write_text("<!doctype html>ZAGRUZCHIK")
        if legacy:
            (tmp_path / "legacy.html").write_text("<!doctype html>STARYJ")
        monkeypatch.setattr(main, "FRONTEND_DIR", tmp_path)

    def test_sluzhebnye_ekrany_poluchayut_legacy(self, client, tmp_path, monkeypatch):
        self._front(tmp_path, monkeypatch)
        for path in ("/tv", "/staff", "/stats"):
            assert "STARYJ" in client.get(path).text, path

    def test_gostevye_ekrany_poluchayut_zagruzchik(self, client, tmp_path, monkeypatch):
        self._front(tmp_path, monkeypatch)
        for path in ("/", "/board"):
            assert "ZAGRUZCHIK" in client.get(path).text, path

    def test_bez_novogo_fronta_vsyo_po_staromu(self, client, tmp_path, monkeypatch):
        self._front(tmp_path, monkeypatch, legacy=False)
        for path in ("/", "/board", "/tv", "/staff", "/stats"):
            assert "ZAGRUZCHIK" in client.get(path).text, path


class TestKesh:
    """Страницы перепроверяются при каждом открытии, хэшированные бандлы
    /app/ кэшируются навсегда — имя меняется вместе с содержимым."""

    def test_stranicy_no_cache(self, client):
        for path in ("/", "/board", "/tv", "/staff", "/stats", "/sw.js"):
            assert client.get(path).headers.get("Cache-Control") == "no-cache", path

    def test_api_bez_kesha_ot_nas(self, client):
        assert "Cache-Control" not in client.get("/api/status").headers

    def test_bandly_navsegda(self):
        import main
        assert main._cache_control("/app/mount-DKH2.js", 200) == (
            "public, max-age=31536000, immutable"
        )
        assert main._cache_control("/app/net-takogo.js", 404) is None
