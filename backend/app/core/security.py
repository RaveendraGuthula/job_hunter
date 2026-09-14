from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings

ALGORITHM = "HS256"
_hasher = None


def _get_hasher():
    global _hasher
    if _hasher is None:
        from pwdlib import PasswordHash

        _hasher = PasswordHash.recommended()
    return _hasher


def hash_password(password: str) -> str:
    return _get_hasher().hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _get_hasher().verify(password, hashed)


def create_access_token(subject: str) -> str:
    now = datetime.now(UTC)
    expires = now + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": subject, "iat": now, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])