import numpy as np
from PIL import Image

from app.services.fraud.signals import Signal


def dhash(img: Image.Image, size: int = 8) -> str:
    """64-bit difference hash: robust to re-compression, resizing and small edits."""
    gray = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    a = np.asarray(gray, dtype=np.int16)
    bits = 0
    for b in (a[:, 1:] > a[:, :-1]).flatten():
        bits = (bits << 1) | int(b)
    return f"{bits:0{size * size // 4}x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def check_duplicate(phash: str | None, prior: list[tuple[int, str]], threshold: int = 6) -> Signal:
    if phash is None:
        return Signal("duplicate_image", "warn", 10, "Could not fingerprint the image")
    matches = [(vid, hamming(phash, h)) for vid, h in prior if h and hamming(phash, h) <= threshold]
    if matches:
        vid, dist = min(matches, key=lambda m: m[1])
        return Signal("duplicate_image", "fail", 60, f"Near-identical to the photo from visit #{vid} (distance {dist})")
    return Signal("duplicate_image", "pass", 0, f"Unique among {len(prior)} previous photos")
