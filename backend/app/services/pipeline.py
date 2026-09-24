import logging
from datetime import datetime, timedelta

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import update
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
from app.timeutil import utcnow

log = logging.getLogger(__name__)

ANALYZABLE = ("submitted", "failed")
STALE_ANALYZING_SECONDS = 120


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


RUNNABLE_STATUSES = ("submitted", "failed", "analyzing")


def run_inline(db: Session, visit_id: int, mode: str = "inline") -> models.Visit:
    """Run the whole pipeline in-process. `mode` is recorded as pipeline_mode for this run."""
    visit = db.get(models.Visit, visit_id)
    if visit.status not in RUNNABLE_STATUSES:
        raise ValueError(f"Visit {visit_id} is already {visit.status}")
    visit.status = "analyzing"
    visit.pipeline_mode = mode
    if visit.analysis_started_at is None:
        visit.analysis_started_at = utcnow()
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


class NotAnalyzable(Exception):
    """The visit could not be claimed for analysis (already running, finished, or claimed by a concurrent call)."""


def last_activity_at(visit: models.Visit) -> datetime:
    """Latest of: when analysis was claimed, the last pipeline_log entry, and when the visit was received."""
    times = [visit.received_at]
    if visit.analysis_started_at:
        times.append(visit.analysis_started_at)
    if visit.pipeline_log:
        times.append(datetime.fromisoformat(visit.pipeline_log[-1]["at"]))
    return max(times)


def is_stale(visit: models.Visit, now: datetime | None = None) -> bool:
    now = now or utcnow()
    return visit.status == "analyzing" and last_activity_at(visit) < now - timedelta(seconds=STALE_ANALYZING_SECONDS)


def claim_for_analysis(db: Session, visit: models.Visit) -> str:
    """Atomically move the visit to "analyzing". Returns "fresh" or "recovery"; raises NotAnalyzable.

    The conditional UPDATE is the lock: of two concurrent calls, only one matches the WHERE clause.
    A stale "analyzing" visit is re-claimed by comparing analysis_started_at with the value read,
    so two concurrent recoveries also cannot both win.
    """
    db.refresh(visit)
    now = utcnow()
    V = models.Visit
    if visit.status in ANALYZABLE:
        stmt = update(V).where(V.id == visit.id, V.status.in_(ANALYZABLE))
        kind = "fresh"
    elif is_stale(visit, now):
        seen = visit.analysis_started_at
        started = V.analysis_started_at.is_(None) if seen is None else V.analysis_started_at == seen
        stmt = update(V).where(V.id == visit.id, V.status == "analyzing", started)
        kind = "recovery"
    else:
        raise NotAnalyzable(visit.status)
    res = db.execute(stmt.values(status="analyzing", analysis_started_at=now).execution_options(synchronize_session=False))
    db.commit()
    db.refresh(visit)
    if res.rowcount != 1:
        raise NotAnalyzable(visit.status)
    return kind


def start_analysis(db: Session, visit: models.Visit, background: BackgroundTasks) -> str:
    """Claim the visit and run the pipeline. Raises NotAnalyzable if the visit cannot be claimed."""
    if claim_for_analysis(db, visit) == "recovery":
        append_step(visit, "recovery", f"No progress for over {STALE_ANALYZING_SECONDS}s; re-running inline")
        db.commit()
        run_inline(db, visit.id, mode="inline_recovery")
        return "inline_recovery"
    if settings.n8n_webhook_url:
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
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.HTTPStatusError) as exc:
        # n8n never got (or refused) the visit, so it is safe to run it here.
        log.warning("n8n unreachable (%s); running pipeline inline for visit %s", exc, visit_id)
        db = SessionLocal()
        try:
            visit = db.get(models.Visit, visit_id)
            append_step(visit, "n8n_unreachable", str(exc))
            db.commit()
            run_inline(db, visit_id, mode="inline_fallback")
        except Exception:
            log.exception("inline fallback failed for visit %s", visit_id)
        finally:
            db.close()
    except httpx.HTTPError as exc:
        # e.g. ReadTimeout: n8n may already be running the visit. Do not run it twice; if it never
        # progresses, POST /visits/{id}/analyze recovers it once it is stale.
        log.warning("n8n did not acknowledge visit %s (%s); leaving it to n8n", visit_id, exc)
