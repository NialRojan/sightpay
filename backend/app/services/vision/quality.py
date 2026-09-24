import io
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.config import settings


@dataclass(frozen=True)
class QualityResult:
    verdict: str  # ok | blurry | dark
    blur_score: float  # variance of Laplacian; higher = sharper
    brightness: float  # mean gray level 0-255


def assess_quality(data: bytes) -> QualityResult:
    img = Image.open(io.BytesIO(data)).convert("L")
    img.thumbnail((512, 512))
    g = np.asarray(img, dtype=np.float32)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    blur, brightness = float(lap.var()), float(g.mean())
    if brightness < settings.dark_threshold:
        verdict = "dark"
    elif blur < settings.blur_threshold:
        verdict = "blurry"
    else:
        verdict = "ok"
    return QualityResult(verdict=verdict, blur_score=round(blur, 1), brightness=round(brightness, 1))
