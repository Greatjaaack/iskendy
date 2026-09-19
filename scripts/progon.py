#!/usr/bin/env python3
"""Прогон по живому контейнеру: все экраны, ручки и сценарии целиком.

Зачем он нужен рядом с pytest. Тесты ходят в приложение через TestClient — без
докера, без uvicorn, без статики, с заглушкой вместо Telegram. Этого достаточно
для логики, но не отвечает на вопрос «поднимется ли собранный образ и работает
ли в нём всё». Здесь наоборот: собранный контейнер, настоящий HTTP, реальные
переходы по сценариям.

Так нашлась сводка, писавшая «заказов не было» в день с выручкой 84 500 ₽:
в юнит-тестах этот путь выглядел здоровым, потому что деньги туда подавались
вручную, а в связке с аналитикой — нет.

    docker build -t iskendy-check .
    docker run -d --rm --name iskendy-check -p 8099:8080 \\
      -e STAFF_PASSWORD=test1234 -e DB_PATH=/data/t.db -e TELEGRAM_BOT_TOKEN= \\
      iskendy-check
    poetry run python scripts/progon.py

Интеграционные пути (поллер кассы и деньги для сводки) требуют подставной
аналитики — она поднимается ключом --analytics и слушает 8098; контейнер тогда
запускать с KASSA_ORDERS_URL/ANALYTICS_SUMMARY_URL на host.docker.internal и
флагом --add-host host.docker.internal:host-gateway.

ВАЖНО: только против локального контейнера. Скрипт занимает сессию кассы,
заводит заказы и чистит табло — на проде это выбьет смену посреди работы.
Поэтому чужой адрес он выполнять отказывается.
"""

import argparse
import json
import random
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

import httpx

MESTNYE = ("127.0.0.1", "localhost", "host.docker.internal", "0.0.0.0")
ANALYTICS_TOKEN = "vnutrenniy-token"


class Otchyot:
    """Копит результаты и печатает их по ходу — видно, где встало."""

    def __init__(self) -> None:
        self.shagi: list[tuple[str, bool, str]] = []

    def razdel(self, imya: str) -> None:
        print(f"\n── {imya} ──")

    def shag(self, imya: str, uslovie: object, podrobno: str = "") -> None:
        ok = bool(uslovie)
        self.shagi.append((imya, ok, podrobno))
        znak = "ок  " if ok else "ПЛОХО"
        hvost = f" — {podrobno}" if podrobno and not ok else ""
        print(f"  {znak} {imya}{hvost}")

    def itog(self) -> int:
        plohie = [s for s in self.shagi if not s[1]]
        print(f"\nИТОГО: {len(self.shagi) - len(plohie)} из {len(self.shagi)} сценариев в порядке")
        if plohie:
            print("НЕ ПРОШЛИ:")
            for imya, _, podrobno in plohie:
                print(f"  · {imya} — {podrobno}")
        return 1 if plohie else 0


class PodstavnayaAnalitika(BaseHTTPRequestHandler):
    """Отдаёт заказы поллеру и выручку сводке — вместо настоящей аналитики."""

    def log_message(self, *a) -> None:  # тишина в выводе прогона
        pass

    def do_GET(self) -> None:
        if self.headers.get("X-Internal-Token") != ANALYTICS_TOKEN:
            self._otvet(401, {})
            return
        teper = datetime.now().replace(microsecond=0).isoformat()
        if self.path.startswith("/api/orders/today"):
            self._otvet(200, {"orders": [{"number": 701, "openTime": teper},
                                         {"number": 702, "openTime": teper}]})
        elif self.path.startswith("/api/summary"):
            self._otvet(200, {"date": "2026-09-12", "revenue": 84500, "checks": 225,
                              "avg_check": 376, "has_data": True})
        else:
            self._otvet(404, {})

    def _otvet(self, kod: int, telo: dict) -> None:
        data = json.dumps(telo).encode()
        self.send_response(kod)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def progon(base: str, parol: str, s_analitikoy: bool = False) -> int:
    o = Otchyot()
    c = httpx.Client(base_url=base, timeout=20, follow_redirects=False)
    GOST = {"X-Forwarded-For": "91.76.12.44"}
    # Номера случайные: прогон должен переживать повторный запуск по той же базе.
    # С постоянными номерами вторая попытка упиралась бы в «дубль номера» и в
    # «отзыв по этому заказу уже есть» — и выглядело бы это как поломка кода.
    nom_ruchnoy = random.randint(10_000, 99_000)
    nom_otzyv = nom_ruchnoy + 1
    # Вход лимитирован десятью попытками в минуту на адрес, а прогон делает три
    # (неверный пароль, верный, второе устройство). Два запуска подряд с одного
    # адреса упёрлись бы в защиту — и это выглядело бы как сломанный вход.
    KASSA = {"X-Forwarded-For": f"10.10.{random.randint(1, 254)}.{random.randint(1, 254)}"}

    o.razdel("ЭКРАНЫ")
    for put in ("/", "/board", "/tv", "/staff", "/stats", "/board?my=1"):
        r = c.get(put)
        o.shag(f"GET {put}", r.status_code == 200 and "<html" in r.text.lower(),
               f"код {r.status_code}")

    o.razdel("ПУБЛИЧНЫЕ РУЧКИ")
    r = c.get("/api/health"); o.shag("health", r.status_code == 200 and r.json() == {"ok": True})
    r = c.get("/api/status"); o.shag("табло отдаётся", r.status_code == 200 and "orders" in r.json())
    r = c.get("/api/qr", params={"data": f"{base}/board"})
    o.shag("QR своего адреса", r.status_code == 200 and r.text.lstrip().startswith("<?xml"))
    r = c.get("/api/qr", params={"data": "https://fishing.example/pay"})
    o.shag("QR чужого адреса отклонён", r.status_code == 400, f"код {r.status_code}")
    r = c.get("/api/feedback/config"); o.shag("настройки отзывов", r.status_code == 200)

    o.razdel("ЗАЩИТА: БЕЗ ТОКЕНА")
    zakrytye = [("POST", "/api/order", {"number": 1}),
                ("POST", "/api/order/status", {"number": 1, "status": "ready"}),
                ("POST", "/api/order/delete", {"number": 1}),
                ("POST", "/api/day/reset", {}),
                ("GET", "/api/events", None),
                ("GET", "/api/stats/days", None),
                ("GET", "/api/security/events", None),
                ("GET", "/api/digest/preview", None)]
    for metod, put, telo in zakrytye:
        r = c.request(metod, put, json=telo) if telo is not None else c.request(metod, put)
        o.shag(f"{put} без токена", r.status_code in (401, 403), f"код {r.status_code}")

    o.razdel("ВХОД")
    r = c.post("/api/auth/login", json={"password": "nevernyy-parol"}, headers=KASSA)
    o.shag("неверный пароль отклонён", r.status_code == 401, f"код {r.status_code}")
    r = c.post("/api/auth/login", json={"password": parol}, headers=KASSA)
    if r.status_code == 429:
        print("\n  упёрлись в лимит входа — подождите минуту и повторите")
    token = r.json().get("token", "")
    o.shag("вход по паролю", r.status_code == 200 and bool(token), r.text[:80])
    if not token:
        print("\nбез токена дальше некуда — проверьте STAFF_PASSWORD контейнера")
        return o.itog()
    SH = {"Authorization": f"Bearer {token}"}
    r = c.post("/api/auth/login", json={"password": parol}, headers=KASSA)
    o.shag("второе устройство отклонено (409)", r.status_code == 409, f"код {r.status_code}")
    o.shag("сессия видна", c.get("/api/auth/session", headers=SH).status_code == 200)
    r = c.get("/api/events", headers={"Authorization": "Bearer poddelka.token.here"})
    o.shag("поддельный токен отклонён", r.status_code == 401, f"код {r.status_code}")

    o.razdel("ЖИЗНЬ ЗАКАЗА")
    r = c.post("/api/order", json={"number": nom_ruchnoy}, headers=SH)
    o.shag("ручное заведение", r.status_code == 200 and any(z["number"] == nom_ruchnoy for z in r.json()["orders"]))
    o.shag("дубль номера отклонён", c.post("/api/order", json={"number": nom_ruchnoy}, headers=SH).status_code == 409)
    o.shag("номер 0 отклонён", c.post("/api/order", json={"number": 0}, headers=SH).status_code == 422)
    o.shag("нечисловой номер отклонён", c.post("/api/order", json={"number": "abc"}, headers=SH).status_code == 422)
    r = c.post("/api/order/status", json={"number": nom_ruchnoy, "status": "ready"}, headers=SH)
    nash = [z for z in r.json().get("orders", []) if z["number"] == nom_ruchnoy]
    o.shag("готовится → готово",
           r.status_code == 200 and nash and nash[0]["status"] == "ready",
           f"код {r.status_code}")
    r = c.post("/api/order/status", json={"number": nom_ruchnoy, "status": "vydumka"}, headers=SH)
    o.shag("неизвестный статус отклонён", r.status_code in (400, 422), f"код {r.status_code}")
    r = c.post("/api/order/status", json={"number": nom_ruchnoy, "status": "served"}, headers=SH)
    o.shag("готово → выдано", r.status_code == 200 and r.json()["servedCount"] >= 1)
    r = c.get("/api/order/served", headers=SH)
    o.shag("список выданных", r.status_code == 200 and
           any(z["number"] == nom_ruchnoy for z in r.json()["orders"]))
    r = c.post("/api/order/revert", json={"number": nom_ruchnoy}, headers=SH)
    o.shag("откат ошибочной выдачи", r.status_code == 200 and any(z["number"] == nom_ruchnoy for z in r.json()["orders"]))
    r = c.post("/api/order/status", json={"number": 999}, headers=SH)
    o.shag("несуществующий заказ отклонён", r.status_code in (404, 409, 422), f"код {r.status_code}")

    o.razdel("ЖУРНАЛЫ")
    r = c.get("/api/events", headers=SH)
    sobytiya = r.json().get("events", [])
    o.shag("журнал событий пишется", r.status_code == 200 and len(sobytiya) >= 3, f"событий {len(sobytiya)}")
    o.shag("журнал безопасности", c.get("/api/security/events", headers=SH).status_code == 200)
    o.shag("сводка безопасности", c.get("/api/security/summary", headers=SH).status_code == 200)

    o.razdel("ГОСТЬ: ОТЗЫВ")
    c.post("/api/order", json={"number": nom_otzyv}, headers=SH)
    c.post("/api/order/status", json={"number": nom_otzyv, "status": "ready"}, headers=SH)
    r = c.post("/api/guest/claim", json={"number": nom_otzyv, "guest": "gost1"}, headers=GOST)
    klyuch = r.json().get("claimToken", "")
    o.shag("гость занял номер", r.status_code == 200 and bool(klyuch), r.text[:80])
    r = c.post("/api/guest/claim", json={"number": nom_otzyv, "guest": "chuzhoy"},
               headers={"X-Forwarded-For": "91.76.12.55"})
    o.shag("чужой номер повторно не занять", r.json().get("ok") is False, str(r.json())[:80])
    o.shag("проверка права на отзыв",
           c.get("/api/feedback/check", params={"number": nom_otzyv}, headers=GOST).status_code == 200)
    c.post("/api/order/status", json={"number": nom_otzyv, "status": "served"}, headers=SH)
    r = c.post("/api/feedback", json={"number": nom_otzyv, "rating": 5, "claim_token": klyuch}, headers=GOST)
    o.shag("отзыв принят", r.json().get("ok") is True, str(r.json())[:90])
    r = c.post("/api/feedback", json={"number": nom_otzyv, "rating": 1, "claim_token": klyuch}, headers=GOST)
    o.shag("второй отзыв на заказ отклонён", r.json().get("ok") is False, str(r.json())[:90])
    r = c.post("/api/feedback", json={"number": nom_otzyv, "rating": 2, "claim_token": "chuzhoy"}, headers=GOST)
    o.shag("отзыв с чужим ключом отклонён", r.json().get("ok") is False, str(r.json())[:90])
    r = c.post("/api/feedback", json={"number": nom_otzyv, "rating": 9, "claim_token": klyuch}, headers=GOST)
    o.shag("оценка вне 1..5 отклонена", r.status_code == 422, f"код {r.status_code}")
    o.shag("шаг воронки принят",
           c.post("/api/guest/event", json={"step": "open", "session": "s1"}, headers=GOST).status_code == 200)
    o.shag("инбокс отзывов для персонала", c.get("/api/feedback/list", headers=SH).status_code == 200)

    o.razdel("ОТЧЁТ ЭКРАНА")
    r = c.post("/api/client/event",
               json={"kind": "offline", "screen": "/staff", "detail": "240 с"}, headers=GOST)
    o.shag("отчёт об обрыве принят", r.status_code == 200)
    r = c.post("/api/client/event", json={"kind": "js", "detail": "я" * 500}, headers=GOST)
    o.shag("слишком длинный detail отклонён", r.status_code == 422, f"код {r.status_code}")

    o.razdel("АНАЛИТИКА")
    for put in ("/api/stats/days", "/api/stats/range", "/api/stats/orders",
                "/api/stats/feedback", "/api/stats/guest"):
        r = c.get(put, headers=SH, params={"dates": datetime.now().date().isoformat()})
        o.shag(f"GET {put}", r.status_code == 200, f"код {r.status_code} {r.text[:60]}")

    o.razdel("СВОДКА И БЭКАП")
    o.shag("предпросмотр сводки", c.get("/api/digest/preview", headers=SH).status_code == 200)
    r = c.get("/api/backup/list", headers=SH)
    o.shag("список бэкапов", r.status_code == 200 and len(r.json().get("backups", [])) >= 1)
    r = c.get("/api/backup/latest", headers=SH)
    o.shag("выгрузка последнего бэкапа", r.status_code == 200 and len(r.content) > 100, f"{len(r.content)} Б")

    o.razdel("СБРОС ДНЯ")
    r = c.post("/api/day/reset", headers=SH)
    o.shag("новый день — табло очищено", r.status_code == 200 and r.json()["orders"] == [])

    if s_analitikoy:
        o.razdel("ПРИЁМ ЗАКАЗОВ ИЗ АНАЛИТИКИ")
        # Поллер тикает не чаще раза в несколько секунд, а прогон быстрый —
        # без ожидания проверялось бы не «доехали заказы», а «успел ли тик».
        zhdyom, nashli = 45, set()
        nachalo = time.monotonic()
        while time.monotonic() - nachalo < zhdyom:
            na_tablo = {z["number"] for z in c.get("/api/status").json().get("orders", [])}
            nashli = na_tablo & {701, 702}
            if len(nashli) == 2:
                break
            time.sleep(2)
        o.shag("заказы доехали из аналитики", len(nashli) == 2,
               f"за {zhdyom} с пришли {sorted(nashli) or 'ничего'}")

        # Второй тик не должен заводить те же заказы заново.
        bylo = len(c.get("/api/status").json()["orders"])
        time.sleep(12)
        stalo = len(c.get("/api/status").json()["orders"])
        o.shag("повторный тик не плодит дубли", bylo == stalo, f"было {bylo}, стало {stalo}")

        r = c.get("/api/digest/preview", headers=SH, params={"date": "2026-09-12"})
        text = r.json().get("text", "")
        o.shag("сводка берёт деньги из аналитики", "84 500" in text, text[:80])
        o.shag("пустое табло не выдаётся за пустой день",
               "Заказов не было" not in text, text[:80])

    o.razdel("ВЫХОД")
    o.shag("выход из кассы", c.post("/api/auth/logout", headers=SH).status_code == 200)
    r = c.post("/api/order", json={"number": 303}, headers=SH)
    o.shag("после выхода токен мёртв", r.status_code == 401, f"код {r.status_code}")

    return o.itog()


def main() -> int:
    p = argparse.ArgumentParser(description="Прогон сценариев по локальному контейнеру")
    p.add_argument("--base", default="http://127.0.0.1:8099", help="адрес контейнера")
    p.add_argument("--password", default="test1234", help="STAFF_PASSWORD контейнера")
    p.add_argument("--analytics", action="store_true",
                   help="поднять подставную аналитику на 8098 и не выходить, пока идёт прогон")
    args = p.parse_args()

    # Скрипт занимает сессию кассы, заводит заказы и чистит табло. На проде это
    # выбьет смену посреди работы, поэтому чужой адрес не обслуживаем вовсе.
    if not any(m in args.base for m in MESTNYE):
        print(f"Отказ: {args.base} — не локальный адрес.\n"
              "Прогон занимает кассу, заводит заказы и чистит табло. Против прода "
              "его запускать нельзя.")
        return 2

    server = None
    if args.analytics:
        server = HTTPServer(("0.0.0.0", 8098), PodstavnayaAnalitika)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        print("подставная аналитика слушает 8098")

    try:
        return progon(args.base.rstrip("/"), args.password, args.analytics)
    finally:
        if server:
            server.shutdown()


if __name__ == "__main__":
    sys.exit(main())
