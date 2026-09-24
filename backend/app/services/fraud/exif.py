import io
from dataclasses import dataclass
from datetime import datetime

from PIL import Image

from app.services.fraud.signals import Signal, haversine_m

EDITORS = ("photoshop", "snapseed", "picsart", "lightroom", "gimp", "canva")
TAG_MAKE, TAG_MODEL, TAG_SOFTWARE, TAG_DATETIME = 0x010F, 0x0110, 0x0131, 0x0132
IFD_EXIF, IFD_GPS, TAG_DATETIME_ORIGINAL = 0x8769, 0x8825, 0x9003


@dataclass(frozen=True)
class ExifInfo:
    has_exif: bool
    make: str | None = None
    model: str | None = None
    software: str | None = None
    datetime_original: datetime | None = None
    gps: tuple[float, float] | None = None


def dms_to_decimal(dms, ref: str) -> float:
    d, m, s = (float(x) for x in dms)
    value = d + m / 60 + s / 3600
    return -value if ref in ("S", "W") else value


def _parse_dt(raw) -> datetime | None:
    try:
        return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def extract_exif(data: bytes) -> ExifInfo:
    try:
        exif = Image.open(io.BytesIO(data)).getexif()
    except Exception:
        return ExifInfo(has_exif=False)
    if not exif:
        return ExifInfo(has_exif=False)
    sub, gps_ifd = exif.get_ifd(IFD_EXIF), exif.get_ifd(IFD_GPS)
    gps = None
    if gps_ifd.get(2) and gps_ifd.get(4):
        try:
            gps = (dms_to_decimal(gps_ifd[2], gps_ifd.get(1, "N")), dms_to_decimal(gps_ifd[4], gps_ifd.get(3, "E")))
        except (TypeError, ValueError, ZeroDivisionError):
            gps = None
    return ExifInfo(
        has_exif=True,
        make=exif.get(TAG_MAKE),
        model=exif.get(TAG_MODEL),
        software=exif.get(TAG_SOFTWARE),
        datetime_original=_parse_dt(sub.get(TAG_DATETIME_ORIGINAL) or exif.get(TAG_DATETIME)),
        gps=gps,
    )


def check_exif(info: ExifInfo, lat: float, lng: float, captured_at: datetime | None) -> Signal:
    """EXIF is easy to strip or forge. It only adds or removes confidence alongside other signals."""
    if not info.has_exif:
        return Signal("exif", "warn", 10, "No EXIF metadata (common for browser captures); neither proves nor disproves authenticity")
    penalty, notes = 0, []
    if info.software and any(tool in info.software.lower() for tool in EDITORS):
        penalty += 20
        notes.append(f"Edited with {info.software}")
    if info.gps:
        d = haversine_m(lat, lng, *info.gps)
        if d > 500:
            penalty += 25
            notes.append(f"EXIF GPS is {d:.0f} m from the reported location")
    if info.datetime_original and captured_at:
        # EXIF time is device-local (IST, no timezone), so only large gaps are meaningful.
        if abs((captured_at - info.datetime_original).total_seconds()) > 24 * 3600:
            penalty += 15
            notes.append("EXIF capture date differs from the visit by more than a day")
    status = "pass" if penalty == 0 else ("fail" if penalty >= 25 else "warn")
    return Signal("exif", status, penalty, "; ".join(notes) or "EXIF consistent with the visit")
