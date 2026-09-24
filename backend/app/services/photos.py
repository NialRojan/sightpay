import hashlib
import io
import uuid
from pathlib import Path

from PIL import Image

from app.config import settings
from app.services.fraud.image_hash import dhash

ALLOWED_MEDIA_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MEDIA_TYPE_BY_PIL_FORMAT = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024


def detect_media_type(data: bytes) -> str | None:
    """Media type from the image bytes themselves (the client header is not trusted).

    Returns None for a readable image in an unsupported format. Raises PIL.UnidentifiedImageError if not an image.
    """
    with Image.open(io.BytesIO(data)) as img:
        return MEDIA_TYPE_BY_PIL_FORMAT.get(img.format)


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
