from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import FraudSignalOut, visit_summary

router = APIRouter(prefix="/fraud", tags=["fraud"])


@router.get("/flagged")
def flagged(db: Session = Depends(get_db)):
    q = (select(models.Visit)
         .where(models.Visit.authenticity_verdict.in_(("REVIEW_REQUIRED", "BLOCKED")))
         .order_by(models.Visit.received_at.desc()).limit(100))
    return [{**visit_summary(v).model_dump(), "verdict": v.authenticity_verdict} for v in db.scalars(q).all()]


@router.get("/{visit_id}")
def fraud_for_visit(visit_id: int, db: Session = Depends(get_db)):
    v = db.get(models.Visit, visit_id)
    if v is None:
        raise HTTPException(404, "Visit not found")
    return {"visit_id": v.id, "score": v.authenticity_score, "verdict": v.authenticity_verdict,
            "signals": [FraudSignalOut.model_validate(s).model_dump() for s in v.fraud_signals]}
