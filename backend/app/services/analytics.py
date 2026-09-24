from collections import Counter
from datetime import datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.schemas import visit_summary
from app.timeutil import utcnow


def _avg(xs):
    return round(sum(xs) / len(xs), 1) if xs else None


def build_dashboard(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    start_today = datetime.combine(now.date(), time.min)
    week_ago = now - timedelta(days=7)

    week = db.scalars(select(models.Visit).where(models.Visit.received_at >= week_ago)).all()
    breakdown = Counter(v.decision for v in week if v.decision)
    judged = breakdown["compliant"] + breakdown["non_compliant"]

    def count(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where))

    kpis = {
        "visits_today": sum(1 for v in week if v.received_at >= start_today),
        "visits_7d": len(week),
        "compliance_rate_7d": round(100 * breakdown["compliant"] / judged, 1) if judged else None,
        "avg_qr_score_7d": _avg([v.audit.qr_visibility_score for v in week if v.audit]),
        "avg_authenticity_7d": _avg([v.authenticity_score for v in week if v.authenticity_score is not None]),
        "blocked_7d": breakdown["fraud"],
        "open_escalations": count(models.Escalation, models.Escalation.status == "open"),
        "incentives_inr_7d": db.scalar(
            select(func.coalesce(func.sum(models.Incentive.amount_inr), 0)).where(models.Incentive.created_at >= week_ago)
        ),
        "whatsapp_sent_7d": count(models.Notification, models.Notification.created_at >= week_ago),
    }

    recent = db.scalars(select(models.Visit).order_by(models.Visit.received_at.desc()).limit(10)).all()

    leaderboard = []
    for fse in db.scalars(select(models.FseProfile)).all():
        mine = [v for v in week if v.fse_id == fse.id]
        leaderboard.append({
            "fse_id": fse.id, "name": fse.user.name, "territory": fse.territory,
            "visits_7d": len(mine),
            "compliant_7d": sum(1 for v in mine if v.decision == "compliant"),
            "verified_pct_7d": round(100 * sum(1 for v in mine if v.authenticity_verdict == "VERIFIED") / len(mine), 1) if mine else None,
            "incentives_inr_7d": sum(v.incentive.amount_inr for v in mine if v.incentive),
        })
    leaderboard.sort(key=lambda r: r["visits_7d"], reverse=True)

    return {
        "generated_at": now.isoformat(),
        "kpis": kpis,
        "decision_breakdown_7d": dict(breakdown),
        "recent_visits": [visit_summary(v).model_dump() for v in recent],
        "fse_leaderboard": leaderboard,
    }
