import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE_CANDIDATES = (Path(".env"), Path("../.env"))


def _expose_legacy_database_url_alias() -> None:
    if "DATABASE_URL" in os.environ:
        return
    for env_file in _ENV_FILE_CANDIDATES:
        if not env_file.is_file():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip().upper() == "DATABASEURL":
                os.environ["DATABASE_URL"] = value.strip().strip('"').strip("'")
                return


_expose_legacy_database_url_alias()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    api_base_url: str = "http://localhost:8000"

    database_url: str = ""
    jwt_secret: str = ""
    jwt_expires_minutes: int = 60 * 24

    cors_origins: list[str] = ["*"]

    ai_provider: str = "groq"
    ai_model: str = "llama-3.3-70b-versatile"
    groq_api_key: str = ""

    ai_max_output_tokens: int = 500
    ai_max_calls_per_day: int = 50
    ai_timeout_seconds: float = 30.0

    storage_provider: str = "local"
    storage_local_path: str = "./uploads"
    storage_bucket: str = ""
    storage_access_key: str = ""
    storage_secret_key: str = ""

    sentry_dsn: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            import json

            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def _ensure_async_driver(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        if value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif value.startswith("postgres://"):
            value = value.replace("postgres://", "postgresql+asyncpg://", 1)
        return cls._normalize_url_for_asyncpg(value)

    @staticmethod
    def _normalize_url_for_asyncpg(url: str) -> str:
        if "?" not in url:
            return url
        base, _, query = url.partition("?")
        keep: list[str] = []
        for param in query.split("&"):
            key, sep, val = param.partition("=")
            if key == "sslmode":
                if val == "disable":
                    continue
                key = "ssl"
            elif key in {"channel_binding", "application_name"}:
                continue
            keep.append(f"{key}={val}" if sep else key)
        if not keep:
            return base
        return f"{base}?{'&'.join(keep)}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()