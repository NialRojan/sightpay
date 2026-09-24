import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db
from app.schemas import AuditOut, EscalationOut, IncentiveOut, InterventionOut, NotificationOut
from app.services import actions
from app.services.memory import get_memory
from app.services.pipeline import step_context, step_decide, step_fraud, step_vision


def require_internal(x_internal_token: str | None = Header(default=None)) -> None:
    if not hmac.compare_digest((x_internal_token or "").encode(), settings.internal_token.encode()):
        raise HTTPException(401, "Invalid internal token")


router = APIRouter(prefix="/internal", tags=["internal (n8n)"], dependencies=[Depends(require_internal)])


def _visit(db: Session, visit_id: int) -> models.Visit:
    visit = db.get(models.Visit, visit_id)
    if visit is None:
        raise HTTPException(404, "Visit not found")
    return visit


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise HTTPException(409, msg)


@router.post("/visits/{visit_id}/fraud")
def fraud(visit_id: int, db: Session = Depends(get_db)):
    r = step_fraud(db, _visit(db, visit_id))
    return {"score": r.score, "verdict": r.verdict, "signals": [s.__dict__ for s in r.signals]}


@router.post("/visits/{visit_id}/vision", response_model=AuditOut)
def vision(visit_id: int, db: Session = Depends(get_db)):
    return step_vision(db, _visit(db, visit_id))


@router.get("/visits/{visit_id}/context")
def context(visit_id: int, db: Session = Depends(get_db)):
    return step_context(db, _visit(db, visit_id)).to_dict()


@router.post("/visits/{visit_id}/decide")
def decide_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.authenticity_verdict is not None and visit.audit is not None, "Run fraud and vision first")
    # A manual retry must not overwrite a decision that is final (e.g. a manager's override).
    _require(visit.decision is None or visit.status == "analyzing", f"Visit already decided and {visit.status}")
    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    d = step_decide(db, visit, ctx)
    return {"visit_id": visit.id, "outcome": d.outcome, "reasons": d.reasons}


@router.post("/visits/{visit_id}/actions/incentive", response_model=IncentiveOut)
def incentive(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "compliant", "Visit is not compliant")
    return actions.grant_incentive(db, visit)


@router.post("/visits/{visit_id}/actions/guidance", response_model=InterventionOut)
def guidance(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "non_compliant", "Visit is not non-compliant")
    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    return actions.create_guidance(db, visit, ctx)


@router.post("/visits/{visit_id}/actions/whatsapp", response_model=NotificationOut)
def whatsapp(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "non_compliant", "Visit is not non-compliant")
    return actions.send_whatsapp(db, visit)


@router.post("/visits/{visit_id}/actions/escalate", response_model=EscalationOut)
def escalate(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "low_confidence", "Visit is not low-confidence")
    return actions.escalate(db, visit, "; ".join(visit.decision_reasons))


@router.post("/visits/{visit_id}/actions/block")
def block(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision == "fraud", "Visit is not flagged as fraud")
    actions.block_visit(db, visit, "; ".join(visit.decision_reasons))
    return {"status": "blocked"}


@router.post("/visits/{visit_id}/complete")
def complete(visit_id: int, db: Session = Depends(get_db)):
    visit = _visit(db, visit_id)
    _require(visit.decision is not None, "Visit has no decision yet")
    actions.complete_visit(db, visit)
    return {"visit_id": visit.id, "status": visit.status, "decision": visit.decision}
