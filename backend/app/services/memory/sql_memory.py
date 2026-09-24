from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.labels import ACTION_LABELS
from app.services.memory.base import MerchantContext

DONE_STATUSES = ("completed", "escalated", "blocked")
HISTORY_DECISIONS = ("compliant", "non_compliant")


class SqlMemory:
    def get_context(self, db: Session, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext:
        merchant = db.get(models.Merchant, merchant_id)
        # Only visits that produced a real verdict on a usable photo count as history. Blocked (fraud),
        # escalated/low-confidence and unusable-photo visits are skipped entirely: they neither feed scores
        # nor break or extend the non-compliant streak.
        q = (
            select(models.Visit)
            .join(models.VisitAudit, models.VisitAudit.visit_id == models.Visit.id)
            .where(
                models.Visit.merchant_id == merchant_id,
                models.Visit.status.in_(DONE_STATUSES),
                models.Visit.decision.in_(HISTORY_DECISIONS),
                models.VisitAudit.image_quality == "ok",
            )
            .order_by(models.Visit.received_at.desc())
            .limit(10)
        )
        if exclude_visit_id is not None:
            q = q.where(models.Visit.id != exclude_visit_id)
        visits = db.scalars(q).all()

        streak = 0
        for v in visits:
            if v.decision != "non_compliant":
                break
            streak += 1

        interventions = db.scalars(
            select(models.Intervention)
            .where(models.Intervention.merchant_id == merchant_id)
            .order_by(models.Intervention.created_at.desc())
            .limit(5)
        ).all()

        ctx = MerchantContext(
            merchant_id=merchant_id,
            merchant_name=merchant.name,
            rep_name=merchant.fse.user.name if merchant.fse else None,
            previous_scores=[v.audit.qr_visibility_score for v in visits],
            previous_issues=[ACTION_LABELS.get(v.audit.recommended_action, v.audit.recommended_action)
                             for v in visits if v.decision == "non_compliant"],
            previous_interventions=[i.action for i in interventions],
            consecutive_non_compliant=streak,
            last_visit_at=visits[0].received_at if visits else None,
        )
        ctx.summary = summarize(ctx)
        return ctx

    def record_visit_outcome(self, db: Session, visit: models.Visit) -> None:
        return None  # history is already in SQL


def summarize(ctx: MerchantContext) -> str:
    if not ctx.previous_scores:
        return f"{ctx.merchant_name}: first audited visit."
    parts = [f"{ctx.merchant_name}: last score {ctx.previous_scores[0]}"]
    if ctx.last_visit_at:
        parts[0] += f" ({ctx.last_visit_at.date().isoformat()})"
    if ctx.previous_issues:
        parts.append(f"previous issue: {ctx.previous_issues[0]}")
    if ctx.previous_interventions:
        parts.append(f"previous intervention: {ctx.previous_interventions[0]}")
    if ctx.consecutive_non_compliant:
        parts.append(f"{ctx.consecutive_non_compliant} non-compliant visit(s) in a row")
    if ctx.transaction_trend_pct is not None:
        parts.append(f"observed transaction change {ctx.transaction_trend_pct:+.1f}%")
    return "; ".join(parts) + "."
