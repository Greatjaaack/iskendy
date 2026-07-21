"""Табло заказов «Искенди» — FastAPI-сервис.

Публично: GET /api/status (гостевое табло: что готовится / что готово).
Под токеном персонала: POST /api/order (занести), /api/order/status
(двигать статус), /api/order/delete, /api/day/reset.
Фронт (frontend/) отдаётся как статика: гостевое табло + экран кассы.
"""

import asyncio
import io
import logging
from pathlib import Path

import db
import segno
from auth import issue_token, require_staff, verify_password
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from iiko_poller import run_poller
from pydantic import BaseModel, Field

# Чтобы логи фонового iiko-поллера были видны рядом с логами uvicorn.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Искенди — табло заказов")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
async def _startup() -> None:
    db.init_db()
    # Фоновый поллер заказов из iiko (если настроен URL/токен аналитики).
    asyncio.create_task(run_poller())


def _payload(board: dict) -> dict:
    """Ответ табло: активные заказы + серверное время (для меток на фронте)."""
    return {**board, "now": db.now_hm()}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/status")
def get_status() -> dict:
    return _payload(db.get_board())


class LoginBody(BaseModel):
    password: str


@app.post("/api/auth/login")
def login(body: LoginBody) -> dict:
    if not verify_password(body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный пароль"
        )
    return {"token": issue_token()}


class OrderBody(BaseModel):
    number: int = Field(gt=0, le=100000)


class StatusBody(BaseModel):
    number: int = Field(gt=0, le=100000)
    status: str


@app.post("/api/order")
def order_add(body: OrderBody, _: dict = Depends(require_staff)) -> dict:
    """Занести новый заказ (статус «готовится»)."""
    try:
        return _payload(db.add_order(body.number))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@app.post("/api/order/status")
def order_status(body: StatusBody, _: dict = Depends(require_staff)) -> dict:
    """Перевести заказ в новый статус: preparing / ready / served."""
    try:
        return _payload(db.set_status(body.number, body.status))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.post("/api/order/delete")
def order_delete(body: OrderBody, _: dict = Depends(require_staff)) -> dict:
    """Удалить активный заказ (ошибочно занесён)."""
    try:
        return _payload(db.delete_order(body.number))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.get("/api/history")
def history(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _: dict = Depends(require_staff),
) -> dict:
    """История заказов за день (включая выданные) с метками времени приёма /
    готовности / выдачи — для персонала. `date` (YYYY-MM-DD) — по умолчанию
    сегодня; выданные хранятся постоянно, так что доступны прошлые дни."""
    day = date or db.today()
    return {"date": day, "orders": db.get_history(day), "now": db.now_hm()}


@app.get("/api/events")
def events(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _: dict = Depends(require_staff),
) -> dict:
    """Журнал событий заказов за день (создание/смена статуса/удаление/сброс) —
    для аудита: кто когда что переключил. `date` (YYYY-MM-DD) — по умолчанию сегодня."""
    day = date or db.today()
    return {"date": day, "events": db.get_events(day), "now": db.now_hm()}


@app.get("/api/stats/days")
def stats_days(_: dict = Depends(require_staff)) -> dict:
    """Аналитика по дням: заказов и средние времена этапов (для персонала)."""
    return {"days": db.stats_days()}


@app.get("/api/stats/hours")
def stats_hours(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    _: dict = Depends(require_staff),
) -> dict:
    """Разбивка по часам за день: заказов и средние времена этапов."""
    day = date or db.today()
    return {"date": day, "hours": db.stats_hours(day)}


@app.post("/api/day/reset")
def day_reset(_: dict = Depends(require_staff)) -> dict:
    """Очистить все заказы за сегодня (новый день)."""
    return _payload(db.reset_day())


@app.get("/api/qr")
def qr(
    data: str = Query(max_length=512),
    border: int = Query(default=2, ge=0, le=8),
) -> Response:
    """SVG QR-кода для произвольной строки (обычно URL табло). `border` — «тихая
    зона» в модулях (белая рамка): 2 для печати, поменьше для экрана табло.
    Генерится локально, без внешних сервисов."""
    buff = io.BytesIO()
    segno.make(data, error="m").save(
        buff, kind="svg", scale=8, border=border, dark="#17130f", light="#ffffff"
    )
    return Response(content=buff.getvalue(), media_type="image/svg+xml")


# --- Статика фронта (после API, чтобы не перехватывать /api/*) ---
if FRONTEND_DIR.exists():

    @app.get("/")
    def index() -> FileResponse:
        """Лендинг-мультиссылка (главная)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/board")
    def board() -> FileResponse:
        """Табло заказов — скрытая вкладка (ссылок с лендинга нет)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/tv")
    def tv() -> FileResponse:
        """ТВ-режим табло — крупная раскладка для телевизора в зале (для персонала)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/staff")
    def staff() -> FileResponse:
        """Экран кассы — заносить заказы и двигать их статусы."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/stats")
    def stats() -> FileResponse:
        """Аналитика по дням/часам — под паролем кассы (для персонала)."""
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
