from typing import Literal

from pydantic import BaseModel

RecommendedAction = Literal[
    "none", "reposition_paytm_qr", "clear_qr_obstruction", "install_soundbox",
    "replace_damaged_qr", "reduce_competitor_dominance", "retake_photo",
]


class VisionUnavailable(Exception):
    pass


class CounterAudit(BaseModel):
    paytm_qr_visible: bool
    qr_visibility_score: int
    soundbox_visible: bool
    competitor: str | None
    competitor_dominance: Literal["none", "low", "medium", "high"]
    qr_obstructed: bool
    suspicious_image_signals: list[str]
    recommended_action: RecommendedAction
    confidence: float
    notes: str

    def clamped(self) -> "CounterAudit":
        return self.model_copy(update={
            "qr_visibility_score": max(0, min(100, self.qr_visibility_score)),
            "confidence": max(0.0, min(1.0, self.confidence)),
        })

    @classmethod
    def unusable(cls, notes: str, signals: list[str] | None = None) -> "CounterAudit":
        return cls(
            paytm_qr_visible=False, qr_visibility_score=0, soundbox_visible=False, competitor=None,
            competitor_dominance="none", qr_obstructed=False, suspicious_image_signals=signals or [],
            recommended_action="retake_photo", confidence=0.0, notes=notes,
        )
