from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import EscalationOut
from app.services.escalations import resolve_escalation

router = APIRouter(prefix="/escalations", tags=["escalations"])


class ResolveIn(BaseModel):
    resolved_by: str
    note: str | None = None


def _row(e: models.Escalation) -> dict:
    return {
        **EscalationOut.model_validate(e).model_dump(),
        "merchant_name": e.merchant.name,
        "fse_name": e.visit.fse.user.name,
        "photo_url": e.visit.photo_url,
        "authenticity_score": e.visit.authenticity_score,
        "qr_visibility_score": e.visit.audit.qr_visibility_score if e.visit.audit else None,
        "confidence": e.visit.audit.confidence if e.visit.audit else None,
    }


@router.get("")
def list_escalations(status: str | None = None, db: Session = Depends(get_db)):
    q = select(models.Escalation).order_by(models.Escalation.created_at.desc())
    if status:
        q = q.where(models.Escalation.status == status)
    return [_row(e) for e in db.scalars(q).all()]


def _resolve(db: Session, esc_id: int, approve: bool, body: ResolveIn) -> dict:
    esc = db.get(models.Escalation, esc_id)
    if esc is None:
        raise HTTPException(404, "Escalation not found")
    try:
        resolve_escalation(db, esc, approve, body.resolved_by, body.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return _row(esc)


@router.post("/{esc_id}/approve")
def approve(esc_id: int, body: ResolveIn, db: Session = Depends(get_db)):
    return _resolve(db, esc_id, True, body)


@router.post("/{esc_id}/reject")
def reject(esc_id: int, body: ResolveIn, db: Session = Depends(get_db)):
    return _resolve(db, esc_id, False, body)
