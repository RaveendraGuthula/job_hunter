import asyncio
import uuid
from pathlib import Path

from app.core.config import settings


def storage_root() -> Path:
    root = Path(settings.storage_local_path)
    root.mkdir(parents=True, exist_ok=True)
    return root


def generate_stored_filename(extension: str) -> str:
    return f"{uuid.uuid4().hex}.{extension}"


async def write_file(stored_filename: str, data: bytes) -> None:
    await asyncio.to_thread(storage_root().joinpath(stored_filename).write_bytes, data)


def read_file(stored_filename: str) -> bytes:
    path = storage_root() / stored_filename
    if not path.is_file():
        raise FileNotFoundError(stored_filename)
    return path.read_bytes()


def delete_file(stored_filename: str) -> None:
    path = storage_root().joinpath(stored_filename)
    if path.is_file():
        path.unlink()