import math
from dataclasses import dataclass
from datetime import datetime

EARTH_RADIUS_M = 6_371_000


@dataclass(frozen=True)
class Signal:
    name: str
    status: str  # pass | warn | fail
    penalty: int
    detail: str


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def check_gps(lat: float, lng: float, merchant_lat: float, merchant_lng: float, radius_m: float = 100.0) -> Signal:
    d = haversine_m(lat, lng, merchant_lat, merchant_lng)
    if d <= radius_m:
        return Signal("gps", "pass", 0, f"{d:.0f} m from merchant (limit {radius_m:.0f} m)")
    if d <= 3 * radius_m:
        return Signal("gps", "warn", 20, f"{d:.0f} m from merchant, outside the {radius_m:.0f} m radius")
    return Signal("gps", "fail", 45, f"{d:.0f} m from merchant; rep was likely not at the shop")


def check_timestamp(captured_at: datetime | None, received_at: datetime, max_skew_min: int = 10) -> Signal:
    if captured_at is None:
        return Signal("timestamp", "warn", 10, "Device did not send a capture time")
    skew = abs((received_at - captured_at).total_seconds()) / 60
    if skew <= max_skew_min:
        return Signal("timestamp", "pass", 0, f"Uploaded {skew:.0f} min after capture")
    if skew <= 60:
        return Signal("timestamp", "warn", 15, f"Uploaded {skew:.0f} min after capture")
    return Signal("timestamp", "fail", 30, f"Capture time is {skew:.0f} min away from upload time")


def check_live_capture(capture_source: str) -> Signal:
    if capture_source == "camera":
        return Signal("live_capture", "pass", 0, "Captured with the in-app camera")
    if capture_source == "gallery":
        return Signal("live_capture", "warn", 25, "Picked from gallery, not captured live")
    return Signal("live_capture", "warn", 10, "Capture source unknown")
