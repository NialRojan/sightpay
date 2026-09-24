from typing import Protocol

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.photos import read_photo
from app.services.vision.fixture_provider import FixtureVisionProvider
from app.services.vision.quality import QualityResult, assess_quality
from app.services.vision.schema import CounterAudit, VisionUnavailable


class VisionProvider(Protocol):
    name: str

    def analyze(self, image_bytes: bytes, media_type: str) -> CounterAudit: ...


def get_vision_provider() -> VisionProvider:
    if settings.vision_provider == "claude":
        from app.services.vision.claude_provider import ClaudeVisionProvider

        return ClaudeVisionProvider()
    return FixtureVisionProvider.from_file(settings.vision_fixtures_path)


def analyze_bytes(data: bytes, media_type: str, provider: VisionProvider | None = None) -> tuple[QualityResult, CounterAudit, str]:
    quality = assess_quality(data)
    if quality.verdict != "ok":
        return quality, CounterAudit.unusable(f"Image is {quality.verdict}; please retake the photo"), "quality_gate"
    provider = provider or get_vision_provider()
    try:
        return quality, provider.analyze(data, media_type).clamped(), provider.name
    except VisionUnavailable as exc:
        return quality, CounterAudit.unusable(f"Vision unavailable: {exc}", ["analysis_failed"]), "error"


def run_vision(db: Session, visit: models.Visit, provider: VisionProvider | None = None) -> models.VisitAudit:
    quality, result, provider_name = analyze_bytes(read_photo(visit), visit.photo_media_type or "image/jpeg", provider)
    db.execute(delete(models.VisitAudit).where(models.VisitAudit.visit_id == visit.id))
    audit = models.VisitAudit(
        visit_id=visit.id,
        paytm_qr_visible=result.paytm_qr_visible,
        qr_visibility_score=result.qr_visibility_score,
        soundbox_visible=result.soundbox_visible,
        competitor=result.competitor,
        competitor_dominance=result.competitor_dominance,
        qr_obstructed=result.qr_obstructed,
        image_quality=quality.verdict,
        blur_score=quality.blur_score,
        suspicious_signals=result.suspicious_image_signals,
        recommended_action=result.recommended_action,
        confidence=result.confidence,
        notes=result.notes,
        provider=provider_name,
        raw=result.model_dump(),
    )
    db.add(audit)
    db.commit()
    db.expire(visit, ["audit"])
    return audit
