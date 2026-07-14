"""Статус-борд партий «Искенди» — FastAPI-сервис.

Публично: GET /api/status (гостевое табло). Под токеном персонала:
POST /api/batch/ready, /api/batch/undo, /api/day/reset, PUT /api/settings.
Фронт (frontend/) отдаётся как статика: гостевое табло + экран персонала.
"""

from pathlib import Path

import db
from auth import issue_token, require_staff, verify_password
from config import settings
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Искенди — статус партий")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


def _status_payload(state: dict) -> dict:
    """Ответ гостевого табло: состояние дня + производные (размер партии)."""
    return {
        "date": state["date"],
        "readyBatch": state["ready_batch"],
        "totalBatches": state["total_batches"],
        "startTime": state["start_time"],
        "intervalMin": state["interval_min"],
        "batchSize": settings.batch_size,
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
