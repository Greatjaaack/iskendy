"""Авторизация персонала: один общий пароль → JWT (HS256, подписан вручную на hmac).

Без внешних зависимостей. Пустой `staff_password` = вход выключен (сверка в
константное время через hmac.compare_digest). Секрет подписи — `jwt_secret`,
при пустом выводится из пароля.
"""

import base64
import hashlib
import hmac
import json
import time

from config import settings
from fastapi import Header, HTTPException, status


def _signing_secret() -> str:
    if settings.jwt_secret:
        return settings.jwt_secret
    return f"iskendy-site:{settings.staff_password}"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _sign(header_body: str) -> str:
    sig = hmac.new(
        _signing_secret().encode("utf-8"),
        header_body.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64url(sig)


def issue_token(subject: str = "staff") -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    exp = int(time.time()) + settings.jwt_ttl_hours * 3600
    payload = _b64url(json.dumps({"sub": subject, "exp": exp}).encode("utf-8"))
    header_body = f"{header}.{payload}"
    return f"{header_body}.{_sign(header_body)}"


def verify_password(password: str) -> bool:
    """Проверка пароля персонала в константное время. Пустой пароль → False."""
    if not settings.staff_password:
        return False
    return hmac.compare_digest(password, settings.staff_password)


def _decode(token: str) -> dict:
    try:
        header, payload, sig = token.split(".")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный токен"
        ) from exc
    if not hmac.compare_digest(sig, _sign(f"{header}.{payload}")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись"
        )
    data = json.loads(_b64url_decode(payload))
    if data.get("exp", 0) < time.time():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен истёк"
        )
    return data


def require_staff(authorization: str = Header(default="")) -> dict:
    """Зависимость FastAPI: Bearer-JWT персонала, иначе 401."""
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Нужна авторизация"
        )
    return _decode(authorization[len(prefix) :])
