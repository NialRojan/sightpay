from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.schemas import EscalationOut, InterventionOut, visit_summary
from app.services.memory import get_memory


def _latest_visit(db: Session, merchant_id: int) -> models.Visit | None:
    return db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == merchant_id).order_by(models.Visit.received_at.desc()).limit(1)
    ).first()


def _merchant_row(db: Session, m: models.Merchant) -> dict:
    v = _latest_visit(db, m.id)
    return {
        "id": m.id, "name": m.name, "owner_name": m.owner_name, "phone": m.phone, "language": m.language,
        "lat": m.lat, "lng": m.lng, "address": m.address, "category": m.category,
        "assigned_fse_id": m.assigned_fse_id, "assigned_fse_name": m.fse.user.name if m.fse else None,
        "latest_score": v.audit.qr_visibility_score if v and v.audit else None,
        "latest_decision": v.decision if v else None,
        "last_visit_at": v.received_at if v else None,
    }


def list_merchants(db: Session) -> list[dict]:
    return [_merchant_row(db, m) for m in db.scalars(select(models.Merchant).order_by(models.Merchant.name)).all()]


def merchant_detail(db: Session, merchant_id: int) -> dict | None:
    m = db.get(models.Merchant, merchant_id)
    if m is None:
        return None
    visits = db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == merchant_id).order_by(models.Visit.received_at.desc()).limit(10)
    ).all()
    interventions = db.scalars(
        select(models.Intervention).where(models.Intervention.merchant_id == merchant_id).order_by(models.Intervention.created_at.desc())
    ).all()
    escalations = db.scalars(
        select(models.Escalation).where(models.Escalation.merchant_id == merchant_id, models.Escalation.status == "open")
    ).all()
    return {
        "merchant": _merchant_row(db, m),
        "context": get_memory().get_context(db, merchant_id).to_dict(),
        "recent_visits": [visit_summary(v).model_dump() for v in visits],
        "interventions": [InterventionOut.model_validate(i).model_dump() for i in interventions],
        "open_escalations": [EscalationOut.model_validate(e).model_dump() for e in escalations],
    }
