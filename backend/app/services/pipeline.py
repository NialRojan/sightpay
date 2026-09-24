import logging

import httpx
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import SessionLocal
from app.services import actions
from app.services.decision import AuditFacts, Decision, decide
from app.services.fraud.engine import run_fraud_checks
from app.services.fraud.scoring import FraudResult
from app.services.memory import get_memory
from app.services.memory.base import MerchantContext
from app.services.steps import append_step
from app.services.vision.engine import run_vision

log = logging.getLogger(__name__)


def step_fraud(db: Session, visit: models.Visit) -> FraudResult:
    result = run_fraud_checks(db, visit)
    append_step(visit, "fraud_check", f"Authenticity {result.score}/100 {result.verdict}")
    db.commit()
    return result


def step_vision(db: Session, visit: models.Visit) -> models.VisitAudit:
    audit = run_vision(db, visit)
    append_step(visit, "vision_ai", f"QR visibility {audit.qr_visibility_score}, confidence {audit.confidence:.2f} ({audit.provider})")
    db.commit()
    return audit


def step_context(db: Session, visit: models.Visit) -> MerchantContext:
    ctx = get_memory().get_context(db, visit.merchant_id, exclude_visit_id=visit.id)
    append_step(visit, "merchant_context", ctx.summary, {"source": ctx.source})
    db.commit()
    return ctx


def step_decide(db: Session, visit: models.Visit, ctx: MerchantContext) -> Decision:
    decision = decide(visit.authenticity_verdict, AuditFacts.from_audit(visit.audit), ctx)
    visit.decision, visit.decision_reasons = decision.outcome, decision.reasons
    append_step(visit, "decision", f"{decision.outcome}: {'; '.join(decision.reasons)}")
    db.commit()
    return decision


def step_act(db: Session, visit: models.Visit, ctx: MerchantContext) -> None:
    reason = "; ".join(visit.decision_reasons)
    if visit.decision == "compliant":
        actions.grant_incentive(db, visit)
    elif visit.decision == "non_compliant":
        actions.create_guidance(db, visit, ctx)
        actions.send_whatsapp(db, visit)
    elif visit.decision == "low_confidence":
        actions.escalate(db, visit, reason)
    elif visit.decision == "fraud":
        actions.block_visit(db, visit, reason)


def run_inline(db: Session, visit_id: int) -> models.Visit:
    visit = db.get(models.Visit, visit_id)
    visit.status = "analyzing"
    visit.pipeline_mode = visit.pipeline_mode or "inline"
    db.commit()
    try:
        step_fraud(db, visit)
        step_vision(db, visit)
        ctx = step_context(db, visit)
        step_decide(db, visit, ctx)
        step_act(db, visit, ctx)
        actions.complete_visit(db, visit)
    except Exception as exc:
        log.exception("pipeline failed for visit %s", visit_id)
        db.rollback()
        visit = db.get(models.Visit, visit_id)
        visit.status = "failed"
        append_step(visit, "error", str(exc))
        db.commit()
        raise
    db.expire(visit)
    return visit


def start_analysis(db: Session, visit: models.Visit, background: BackgroundTasks) -> str:
    if settings.n8n_webhook_url:
        visit.status = "analyzing"
        visit.pipeline_mode = "n8n"
        append_step(visit, "queued", "Sent to n8n workflow")
        db.commit()
        background.add_task(_post_to_n8n, visit.id, visit.merchant_id)
        return "n8n"
    run_inline(db, visit.id)
    return "inline"


def _post_to_n8n(visit_id: int, merchant_id: int) -> None:
    try:
        res = httpx.post(settings.n8n_webhook_url, json={"visit_id": visit_id, "merchant_id": merchant_id}, timeout=5.0)
        res.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("n8n unreachable (%s); running pipeline inline for visit %s", exc, visit_id)
        db = SessionLocal()
        try:
            visit = db.get(models.Visit, visit_id)
            visit.pipeline_mode = "inline_fallback"
            append_step(visit, "n8n_unreachable", str(exc))
            db.commit()
            run_inline(db, visit_id)
        except Exception:
            log.exception("inline fallback failed for visit %s", visit_id)
        finally:
            db.close()
