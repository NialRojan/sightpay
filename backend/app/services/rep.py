from collections import defaultdict
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models
from app.services.fraud.signals import haversine_m
from app.services.labels import ACTION_LABELS
from app.timeutil import utcnow

# A visit only counts as a real visit (for "latest", "visited today" and coverage) once it has finished with a
# usable outcome. Blocked (fraud), rejected, failed and still-in-flight visits are ignored.
USABLE_STATUSES = ("completed", "escalated")


def _usable_visits_by_merchant(db: Session, merchant_ids: list[int]) -> dict[int, list[models.Visit]]:
    """Usable visits per merchant, newest first, in one query."""
    rows = db.scalars(
        select(models.Visit)
        .options(selectinload(models.Visit.audit))
        .where(models.Visit.merchant_id.in_(merchant_ids), models.Visit.status.in_(USABLE_STATUSES))
        .order_by(models.Visit.received_at.desc())
    ).all()
    out: dict[int, list[models.Visit]] = defaultdict(list)
    for v in rows:
        out[v.merchant_id].append(v)
    return out


def _txn_declining(db: Session, merchant_id: int) -> bool:
    rows = db.scalars(
        select(models.Transaction).where(models.Transaction.merchant_id == merchant_id)
        .order_by(models.Transaction.txn_date.desc()).limit(14)
    ).all()
    if len(rows) < 14:
        return False
    recent, prior = sum(r.amount_inr for r in rows[:7]), sum(r.amount_inr for r in rows[7:])
    return prior > 0 and recent < 0.9 * prior


def priority_queue(db: Session, fse_id: int, lat: float | None = None, lng: float | None = None, now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    start_today = datetime.combine(now.date(), time.min)
    merchants = db.scalars(select(models.Merchant).where(models.Merchant.assigned_fse_id == fse_id)).all()
    visits_by_merchant = _usable_visits_by_merchant(db, [m.id for m in merchants])
    queue = []
    for m in merchants:
        visits = visits_by_merchant.get(m.id, [])
        latest = visits[0] if visits else None
        if latest and latest.received_at >= start_today:
            continue  # already visited today
        reasons, priority = [], 0.0

        score = latest.audit.qr_visibility_score if latest and latest.audit else None
        if score is None:
            priority += 60
            reasons.append("Never audited")
        else:
            priority += 100 - score
            reasons.append(f"Last QR score {score}")

        days = (now - latest.received_at).days if latest else None
        priority += 60 if days is None else min(days, 30) * 2
        if days is not None and days >= 14:
            reasons.append(f"Not visited for {days} days")

        if latest and latest.decision in ("non_compliant", "low_confidence") and latest.audit:
            priority += 20
            reasons.append(f"Open issue: {ACTION_LABELS.get(latest.audit.recommended_action, latest.audit.recommended_action)}")

        if _txn_declining(db, m.id):
            priority += 15
            reasons.append("Transactions down >10% week on week")

        distance = None
        if lat is not None and lng is not None:
            distance = round(haversine_m(lat, lng, m.lat, m.lng))
            priority -= min(distance / 1000 * 5, 30)

        queue.append({
            "merchant_id": m.id, "name": m.name, "owner_name": m.owner_name, "lat": m.lat, "lng": m.lng,
            "distance_m": distance, "priority": round(priority, 1), "reasons": reasons,
            "latest_score": score, "latest_decision": latest.decision if latest else None, "days_since_visit": days,
        })
    queue.sort(key=lambda r: r["priority"], reverse=True)
    return queue


def coverage(db: Session, fse_id: int, now: datetime | None = None, days: int = 30) -> dict:
    now = now or utcnow()
    assigned = db.scalars(select(models.Merchant.id).where(models.Merchant.assigned_fse_id == fse_id)).all()
    visited = set(db.scalars(
        select(models.Visit.merchant_id).where(
            models.Visit.merchant_id.in_(assigned), models.Visit.received_at >= now - timedelta(days=days),
            models.Visit.status.in_(USABLE_STATUSES),
        )
    ).all())
    pct = round(100 * len(visited) / len(assigned), 1) if assigned else 0.0
    return {"assigned": len(assigned), "visited": len(visited), "coverage_pct": pct}


def performance(db: Session, fse_id: int, now: datetime | None = None, days: int = 30) -> dict:
    now = now or utcnow()
    visits = db.scalars(
        select(models.Visit)
        .options(selectinload(models.Visit.incentive))
        .where(models.Visit.fse_id == fse_id, models.Visit.received_at >= now - timedelta(days=days))
    ).all()
    n = len(visits)

    def pct(k):
        return round(100 * k / n, 1) if n else None

    conversions = 0
    history_by_merchant = _usable_visits_by_merchant(db, list({v.merchant_id for v in visits}))
    for history_visits in history_by_merchant.values():
        history = [v.decision for v in reversed(history_visits) if v.decision in ("compliant", "non_compliant")]
        if any(a == "non_compliant" and b == "compliant" for a, b in zip(history, history[1:])):
            conversions += 1
    auth = [v.authenticity_score for v in visits if v.authenticity_score is not None]
    return {
        "visits": n,
        "verified_pct": pct(sum(1 for v in visits if v.authenticity_verdict == "VERIFIED")),
        "compliant_pct": pct(sum(1 for v in visits if v.decision == "compliant")),
        "avg_authenticity": round(sum(auth) / len(auth), 1) if auth else None,
        "incentives_inr": sum(v.incentive.amount_inr for v in visits if v.incentive),
        "conversions": conversions,
    }


def fse_summary(db: Session, fse_id: int, lat: float | None = None, lng: float | None = None, now: datetime | None = None) -> dict | None:
    fse = db.get(models.FseProfile, fse_id)
    if fse is None:
        return None
    now = now or utcnow()
    queue = priority_queue(db, fse_id, lat, lng, now)
    return {
        "fse": {"id": fse.id, "name": fse.user.name, "territory": fse.territory},
        "coverage": coverage(db, fse_id, now),
        "performance": performance(db, fse_id, now),
        "next_best": queue[0] if queue else None,
    }
