"""Табло заказов «Искенди» — FastAPI-сервис.

Публично: GET /api/status (гостевое табло: что готовится / что готово).
Под токеном персонала: POST /api/order (занести), /api/order/status
(двигать статус), /api/order/delete, /api/day/reset.
Фронт (frontend/) отдаётся как статика: гостевое табло + экран кассы.
"""

import io
from pathlib import Path

import db
import segno
from auth import issue_token, require_staff, verify_password
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="Искенди — табло заказов")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


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


@app.post("/api/day/reset")
def day_reset(_: dict = Depends(require_staff)) -> dict:
    """Очистить все заказы за сегодня (новый день)."""
    return _payload(db.reset_day())


@app.get("/api/qr")
def qr(data: str = Query(max_length=512)) -> Response:
    """SVG QR-кода для произвольной строки (обычно URL табло) — для печати
    таблички/наклейки. Генерится локально, без внешних сервисов."""
    buff = io.BytesIO()
    segno.make(data, error="m").save(
        buff, kind="svg", scale=8, border=2, dark="#17130f", light="#ffffff"
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

    @app.get("/staff")
    def staff() -> FileResponse:
        """Экран кассы — заносить заказы и двигать их статусы."""
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
