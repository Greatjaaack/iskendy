"""Статус-борд партий «Искенди» — FastAPI-сервис.

Публично: GET /api/status (гостевое табло). Под токеном персонала:
POST /api/batch/ready, /api/batch/undo, /api/day/reset, PUT /api/settings.
Фронт (frontend/) отдаётся как статика: гостевое табло + экран персонала.
"""

import io
from pathlib import Path

import db
import segno
from auth import issue_token, require_staff, verify_password
from config import settings
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Искенди — статус партий")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


def _status_payload(state: dict) -> dict:
    """Ответ гостевого табло: состояние дня + производные (размер партии,
    дневная норма позиций, серверное время для экрана «приём с …»)."""
    return {
        "date": state["date"],
        "readyBatch": state["ready_batch"],
        "totalBatches": state["total_batches"],
        "startTime": state["start_time"],
        "intervalMin": state["interval_min"],
        "batchSize": settings.batch_size,
        "capacity": state["total_batches"] * settings.batch_size,
        "soldOut": bool(state["sold_out"]),
        "now": db.now_hm(),
        "updatedAt": state["updated_at"],
    }


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/status")
def get_status() -> dict:
    return _status_payload(db.get_state())


class LoginBody(BaseModel):
    password: str


@app.post("/api/auth/login")
def login(body: LoginBody) -> dict:
    if not verify_password(body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный пароль"
        )
    return {"token": issue_token()}


@app.post("/api/batch/ready")
def batch_ready(_: dict = Depends(require_staff)) -> dict:
    return _status_payload(db.mark_ready())


@app.post("/api/batch/undo")
def batch_undo(_: dict = Depends(require_staff)) -> dict:
    return _status_payload(db.undo_ready())


@app.post("/api/day/reset")
def day_reset(_: dict = Depends(require_staff)) -> dict:
    return _status_payload(db.reset_day())


@app.post("/api/day/stop")
def day_stop(_: dict = Depends(require_staff)) -> dict:
    """Стоп продаж на сегодня — гостю показывается «на сегодня всё продано»."""
    return _status_payload(db.set_sold_out(True))


@app.post("/api/day/open")
def day_open(_: dict = Depends(require_staff)) -> dict:
    """Снять стоп продаж (открыть снова)."""
    return _status_payload(db.set_sold_out(False))


@app.get("/api/qr")
def qr(data: str = Query(max_length=512)) -> Response:
    """SVG QR-кода для произвольной строки (обычно URL этой страницы) — для
    печати таблички/наклейки. Генерится локально, без внешних сервисов."""
    buff = io.BytesIO()
    segno.make(data, error="m").save(
        buff, kind="svg", scale=8, border=2, dark="#17130f", light="#ffffff"
    )
    return Response(content=buff.getvalue(), media_type="image/svg+xml")


class SettingsBody(BaseModel):
    totalBatches: int
    startTime: str
    intervalMin: int


@app.put("/api/settings")
def put_settings(
    body: SettingsBody, _: dict = Depends(require_staff)
) -> dict:
    state = db.update_settings(
        total_batches=body.totalBatches,
        start_time=body.startTime,
        interval_min=body.intervalMin,
    )
    return _status_payload(state)


# --- Статика фронта (после API, чтобы не перехватывать /api/*) ---
if FRONTEND_DIR.exists():

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
