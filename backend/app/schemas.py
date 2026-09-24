from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AuditOut(ORM):
    paytm_qr_visible: bool
    qr_visibility_score: int
    soundbox_visible: bool
    competitor: str | None
    competitor_dominance: str
    qr_obstructed: bool
    image_quality: str
    blur_score: float
    suspicious_signals: list[str]
    recommended_action: str
    confidence: float
    notes: str
    provider: str
    created_at: datetime
