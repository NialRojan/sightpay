import hashlib
import io
import uuid
from pathlib import Path

from PIL import Image

from app.config import settings
from app.services.fraud.image_hash import dhash

ALLOWED_MEDIA_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def fingerprint(data: bytes) -> tuple[str, str]:
    """Returns (sha256 hex, 64-bit dHash hex). Raises PIL.UnidentifiedImageError if not an image."""
    with Image.open(io.BytesIO(data)) as img:
        return hashlib.sha256(data).hexdigest(), dhash(img)


def store_photo(data: bytes, media_type: str) -> str:
    name = f"visit_{uuid.uuid4().hex}{ALLOWED_MEDIA_TYPES[media_type]}"
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    (path / name).write_bytes(data)
    return name


def read_photo(visit) -> bytes:
    return (Path(settings.upload_dir) / visit.photo_path).read_bytes()
