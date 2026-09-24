import io
from types import SimpleNamespace

import numpy as np
from PIL import Image

from app import models


def _jpeg(arr: np.ndarray, exif=None) -> bytes:
    buf = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    Image.fromarray(arr).save(buf, "JPEG", quality=90, **kwargs)
    return buf.getvalue()


def sharp_jpeg(seed: int = 0, exif=None) -> bytes:
    rng = np.random.default_rng(seed)
    return _jpeg(rng.integers(0, 256, (480, 640, 3), dtype=np.uint8), exif)


def blurry_jpeg() -> bytes:
    return _jpeg(np.full((480, 640, 3), 128, dtype=np.uint8))


def dark_jpeg() -> bytes:
    rng = np.random.default_rng(7)
    return _jpeg(rng.integers(0, 30, (480, 640, 3), dtype=np.uint8))


def make_world(db):
    manager = models.User(name="Priya Kulkarni", role="manager")
    fse_user = models.User(name="Amit Patil", role="fse", phone="+919800000001")
    db.add_all([manager, fse_user])
    db.flush()
    fse = models.FseProfile(user_id=fse_user.id, territory="Kothrud", home_lat=18.5074, home_lng=73.8077, manager_id=manager.id)
    db.add(fse)
    db.flush()
    merchant = models.Merchant(
        name="Ramesh General Store", owner_name="Ramesh", phone="+919811111111", language="hi-IN",
        lat=18.5074, lng=73.8077, address="Kothrud, Pune", category="kirana", assigned_fse_id=fse.id,
    )
    db.add(merchant)
    db.commit()
    return SimpleNamespace(manager=manager, fse=fse, merchant=merchant)
