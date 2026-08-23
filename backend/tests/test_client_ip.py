"""Разбор X-Forwarded-For — от него зависят все лимиты по адресу.

Дыра, которую это закрывает: брали первый элемент заголовка, а Caddy дописывает
настоящий адрес в КОНЕЦ, сохраняя присланное клиентом. То есть первым шло то,
что напечатал сам клиент, и любой лимит — включая десять попыток пароля —
обходился одной строкой в curl: счётчик каждый раз заводился на выдуманный адрес.

Тонкость, из-за которой мало просто «брать последний»: если запрос пришёл не от
прокси, весь заголовок сочинён клиентом, и последний элемент ничем не лучше
первого. Поэтому заголовку верим только от внутренней сети.
"""

import pytest

from main import _client_ip, _trusted_peer


class _Client:
    def __init__(self, host):
        self.host = host


class _Request:
    def __init__(self, peer, xff=None):
        self.client = _Client(peer) if peer else None
        self.headers = {"x-forwarded-for": xff} if xff else {}


@pytest.mark.parametrize(
    "peer, xff, ozhidaem, pochemu",
    [
        ("172.18.0.5", "203.0.113.9, 91.76.12.4", "91.76.12.4",
         "запрос от Caddy: настоящий адрес он дописал в конец"),
        ("172.18.0.5", "91.76.12.4", "91.76.12.4",
         "клиент не слал заголовок, Caddy проставил один адрес"),
        ("8.8.8.8", "203.0.113.9, 1.1.1.1", "8.8.8.8",
         "прямое обращение снаружи: заголовок весь выдуман, верим соединению"),
        ("172.18.0.5", None, "172.18.0.5",
         "заголовка нет — адрес соединения"),
        ("127.0.0.1", "91.76.12.4", "91.76.12.4",
         "локальный прокси тоже доверенный"),
        (None, "203.0.113.9", "unknown",
         "нет ни адреса соединения, ни доверия заголовку"),
    ],
)
def test_razbor_zagolovka(peer, xff, ozhidaem, pochemu):
    assert _client_ip(_Request(peer, xff)) == ozhidaem, pochemu


def test_pervyj_element_nikogda_ne_beryotsya():
    """Главная суть фикса: подделка в начале заголовка игнорируется."""
    poddelka = "1.2.3.4"
    nastoyashchij = "91.76.12.4"
    req = _Request("172.18.0.5", f"{poddelka}, {nastoyashchij}")
    assert _client_ip(req) != poddelka
    assert _client_ip(req) == nastoyashchij


@pytest.mark.parametrize("host, doveryaem", [
    ("172.18.0.5", True),      # сеть docker, в которой живёт Caddy
    ("10.0.0.1", True),
    ("192.168.1.1", True),
    ("127.0.0.1", True),
    ("8.8.8.8", False),        # настоящий внешний адрес
    ("91.76.12.4", False),
    ("45.130.9.88", False),
    ("testclient", False),     # так представляется TestClient
    ("", False),
    ("не-адрес", False),
])
def test_komu_doveryaem(host, doveryaem):
    assert _trusted_peer(host) is doveryaem


def test_dokumentacionnye_diapazony_schitayutsya_doverennymi():
    """Оговорка, чтобы не спотыкаться о неё второй раз.

    203.0.113.0/24 и соседние из RFC 5737 — документационные, и Python помечает
    их `is_private = True`, то есть доверенными. На проде это ни на что не
    влияет: такие адреса в интернете не маршрутизируются, соединение с них не
    придёт, а адресом соединения всегда оказывается Caddy из сети docker.
    Держим тест, чтобы поведение было описано, а не обнаруживалось случайно.
    """
    assert _trusted_peer("203.0.113.9") is True
