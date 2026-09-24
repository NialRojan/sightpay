import hashlib
import json
from pathlib import Path

from app.services.vision.schema import CounterAudit

PRESETS = {
    "compliant": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=89, soundbox_visible=True, competitor="PhonePe",
        competitor_dominance="low", qr_obstructed=False, suspicious_image_signals=[], recommended_action="none",
        confidence=0.93, notes="Paytm QR clearly visible beside the billing counter; Soundbox on.",
    ),
    "non_compliant": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=38, soundbox_visible=True, competitor="PhonePe",
        competitor_dominance="high", qr_obstructed=True, suspicious_image_signals=[],
        recommended_action="reposition_paytm_qr", confidence=0.93,
        notes="PhonePe standee dominates the counter; Paytm QR is partly behind the register.",
    ),
    "low_confidence": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=55, soundbox_visible=False, competitor=None,
        competitor_dominance="none", qr_obstructed=False, suspicious_image_signals=[],
        recommended_action="retake_photo", confidence=0.41, notes="Counter only partly in frame.",
    ),
    "suspicious": CounterAudit(
        paytm_qr_visible=True, qr_visibility_score=80, soundbox_visible=True, competitor=None,
        competitor_dominance="none", qr_obstructed=False, suspicious_image_signals=["photo_of_screen"],
        recommended_action="none", confidence=0.8, notes="Looks like a photo of a phone screen.",
    ),
}


class FixtureVisionProvider:
    """Deterministic offline provider: a rehearsed demo photo always yields the same audit."""

    name = "fixture"

    def __init__(self, by_sha256: dict[str, str] | None = None, default: str = "non_compliant"):
        self.by_sha256 = by_sha256 or {}
        self.default = default

    @classmethod
    def from_file(cls, path) -> "FixtureVisionProvider":
        p = Path(path)
        if not p.exists():
            return cls()
        data = json.loads(p.read_text())
        return cls(by_sha256=data.get("photos", {}), default=data.get("default", "non_compliant"))

    def analyze(self, image_bytes: bytes, media_type: str) -> CounterAudit:
        preset = self.by_sha256.get(hashlib.sha256(image_bytes).hexdigest(), self.default)
        return PRESETS[preset].model_copy(deep=True)
