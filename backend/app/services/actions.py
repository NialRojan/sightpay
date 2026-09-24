from sqlalchemy.orm import Session

from app import models
from app.services.guidance import build_guidance
from app.services.localization import localize_guidance
from app.services.memory import get_memory
from app.services.memory.base import MerchantContext
from app.services.steps import append_step
from app.services.whatsapp import send_whatsapp_message
from app.timeutil import utcnow

INCENTIVE_AMOUNT_INR = 50
STATUS_BY_OUTCOME = {"compliant": "completed", "non_compliant": "completed", "low_confidence": "escalated", "fraud": "blocked"}


def grant_incentive(db: Session, visit: models.Visit) -> models.Incentive:
    existing = db.query(models.Incentive).filter_by(visit_id=visit.id).one_or_none()
    if existing:
        return existing
    inc = models.Incentive(
        fse_id=visit.fse_id, merchant_id=visit.merchant_id, visit_id=visit.id,
        amount_inr=INCENTIVE_AMOUNT_INR, status="approved", reason="Verified compliant visit",
    )
    db.add(inc)
    append_step(visit, "incentive", f"₹{INCENTIVE_AMOUNT_INR} incentive approved for {visit.fse.user.name}")
    db.commit()
    return inc


def create_guidance(db: Session, visit: models.Visit, ctx: MerchantContext | None) -> models.Intervention:
    existing = db.query(models.Intervention).filter_by(visit_id=visit.id).one_or_none()
    if existing:
        return existing
    g = build_guidance(visit.merchant, visit.audit, ctx)
    loc = localize_guidance(g, f"guidance_visit{visit.id}")
    iv = models.Intervention(
        merchant_id=visit.merchant_id, visit_id=visit.id, action=g.action, issue=g.issue,
        message_text_en=g.text_en, message_text=loc.text, message_language=g.language, audio_path=loc.audio_path,
    )
    db.add(iv)
    append_step(visit, "guidance", f"{loc.engine}: {g.issue} guidance in {g.language}"
                + (" with voice note" if loc.audio_path else ""), {"text": loc.text})
    db.commit()
    return iv


def send_whatsapp(db: Session, visit: models.Visit) -> models.Notification:
    existing = db.query(models.Notification).filter_by(visit_id=visit.id, channel="whatsapp").first()
    if existing:
        return existing
    iv = visit.intervention or create_guidance(db, visit, None)
    result = send_whatsapp_message(visit.merchant.phone, iv.message_text, iv.audio_url)
    n = models.Notification(
        merchant_id=visit.merchant_id, visit_id=visit.id, channel="whatsapp", to_phone=visit.merchant.phone,
        body=iv.message_text, audio_url=iv.audio_url, status=result.status,
        provider_ref=result.provider_ref, error=result.error,
    )
    db.add(n)
    append_step(visit, "whatsapp", f"WhatsApp {result.status} to {visit.merchant.owner_name}")
    db.commit()
    return n


def escalate(db: Session, visit: models.Visit, reason: str) -> models.Escalation:
    existing = db.query(models.Escalation).filter_by(visit_id=visit.id).one_or_none()
    if existing:
        return existing
    esc = models.Escalation(visit_id=visit.id, merchant_id=visit.merchant_id, reason=reason, status="open")
    db.add(esc)
    append_step(visit, "escalation", f"Escalated to manager: {reason}")
    db.commit()
    return esc


def block_visit(db: Session, visit: models.Visit, reason: str) -> None:
    if visit.status == "blocked":
        return
    visit.status = "blocked"
    append_step(visit, "block", f"Visit blocked: {reason}")
    db.commit()


def complete_visit(db: Session, visit: models.Visit) -> None:
    if visit.completed_at is not None:
        return
    visit.status = STATUS_BY_OUTCOME[visit.decision]
    visit.completed_at = utcnow()
    append_step(visit, "complete", f"Visit {visit.status}")
    db.commit()
    if visit.decision != "fraud":  # a blocked visit is not merchant history
        get_memory().record_visit_outcome(db, visit)
