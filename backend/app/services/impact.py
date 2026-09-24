from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.labels import ACTION_LABELS

CAVEAT = ("Observed change around the intervention date. This is not proof that the intervention caused it: "
          "seasonality, festivals and other factors also move sales.")


@dataclass(frozen=True)
class ImpactResult:
    intervention_date: date
    baseline_start: date
    baseline_end: date
    post_start: date
    post_end: date
    baseline_days: int
    post_days: int
    baseline_avg_daily_inr: float | None
    post_avg_daily_inr: float | None
    change_inr: float | None
    change_pct: float | None
    baseline_avg_txn_count: float | None
    post_avg_txn_count: float | None
    status: str  # ok | insufficient_data
    label: str = "observed_change"
    caveat: str = CAVEAT

    def to_dict(self) -> dict:
        d = asdict(self)
        for k, v in d.items():
            if isinstance(v, date):
                d[k] = v.isoformat()
        return d


def _mean(xs: list[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def _round(x: float | None, ndigits: int) -> float | None:
    return round(x, ndigits) if x is not None else None


def compute_impact(rows: list[tuple[date, float, int]], intervention_date: date, window_days: int = 14, min_days: int = 3) -> ImpactResult:
    b_start, b_end = intervention_date - timedelta(days=window_days), intervention_date - timedelta(days=1)
    p_start, p_end = intervention_date + timedelta(days=1), intervention_date + timedelta(days=window_days)
    # Collapse to one row per day so repeated dates never count as extra days.
    daily: dict[date, list[float]] = defaultdict(lambda: [0.0, 0])
    for d, amount, count in rows:
        daily[d][0] += amount
        daily[d][1] += count
    base = [v for d, v in daily.items() if b_start <= d <= b_end]
    post = [v for d, v in daily.items() if p_start <= d <= p_end]

    b_avg, p_avg = _mean([a for a, _ in base]), _mean([a for a, _ in post])
    # A zero baseline has no meaningful % change, so it is reported as insufficient data.
    ok = len(base) >= min_days and len(post) >= min_days and b_avg is not None and b_avg > 0
    return ImpactResult(
        intervention_date=intervention_date, baseline_start=b_start, baseline_end=b_end, post_start=p_start, post_end=p_end,
        baseline_days=len(base), post_days=len(post),
        baseline_avg_daily_inr=_round(b_avg, 2), post_avg_daily_inr=_round(p_avg, 2),
        change_inr=round(p_avg - b_avg, 2) if ok else None,
        change_pct=round(100 * (p_avg - b_avg) / b_avg, 1) if ok else None,
        baseline_avg_txn_count=_round(_mean([c for _, c in base]), 1), post_avg_txn_count=_round(_mean([c for _, c in post]), 1),
        status="ok" if ok else "insufficient_data",
    )


class InterventionNotFound(LookupError):
    """The requested intervention does not exist or belongs to another merchant."""


def _intervention_date(iv: models.Intervention) -> date:
    # created_at is naive UTC (the visit time); transactions are daily aggregates keyed by the same calendar date.
    return iv.created_at.date()


def load_rows(db: Session, merchant_id: int) -> list[tuple[date, float, int]]:
    rows = db.scalars(
        select(models.Transaction).where(models.Transaction.merchant_id == merchant_id).order_by(models.Transaction.txn_date)
    ).all()
    return [(r.txn_date, r.amount_inr, r.txn_count) for r in rows]


def _latest_intervention(db: Session, merchant_id: int) -> models.Intervention | None:
    return db.scalars(
        select(models.Intervention).where(models.Intervention.merchant_id == merchant_id)
        .order_by(models.Intervention.created_at.desc(), models.Intervention.id.desc()).limit(1)
    ).first()


def latest_impact(db: Session, merchant_id: int) -> ImpactResult | None:
    iv = _latest_intervention(db, merchant_id)
    return compute_impact(load_rows(db, merchant_id), _intervention_date(iv)) if iv else None


def merchant_impact(db: Session, merchant_id: int, intervention_id: int | None = None) -> dict | None:
    """Before/after impact for one merchant. None if the merchant is unknown; raises InterventionNotFound
    if `intervention_id` is given but is not one of this merchant's interventions."""
    m = db.get(models.Merchant, merchant_id)
    if m is None:
        return None
    if intervention_id is not None:
        iv = db.get(models.Intervention, intervention_id)
        if iv is None or iv.merchant_id != merchant_id:
            raise InterventionNotFound(intervention_id)
    else:
        iv = _latest_intervention(db, merchant_id)
    body = {"merchant_id": m.id, "merchant_name": m.name, "label": "observed_change", "caveat": CAVEAT,
            "intervention": None, "impact": None, "series": []}
    if iv is None:
        return body
    rows = load_rows(db, merchant_id)
    result = compute_impact(rows, _intervention_date(iv))
    series = []
    for d, amount, count in rows:
        if result.baseline_start <= d <= result.post_end:
            phase = "baseline" if d < result.intervention_date else ("intervention" if d == result.intervention_date else "post")
            series.append({"date": d.isoformat(), "amount_inr": amount, "txn_count": count, "phase": phase})
    body["intervention"] = {"id": iv.id, "action": iv.action, "issue": iv.issue, "date": result.intervention_date.isoformat(),
                            "visit_id": iv.visit_id, "message_text": iv.message_text}
    body["impact"] = result.to_dict()
    body["series"] = series
    return body


def portfolio_impact(db: Session) -> dict:
    """Average observed change per action, over each merchant's latest intervention. Only `ok` results count."""
    latest: dict[int, models.Intervention] = {}
    for iv in db.scalars(select(models.Intervention).order_by(models.Intervention.created_at, models.Intervention.id)).all():
        latest[iv.merchant_id] = iv  # ascending order, so the last one seen per merchant is the latest
    rows: dict[int, list[tuple[date, float, int]]] = defaultdict(list)
    for t in db.scalars(select(models.Transaction).where(models.Transaction.merchant_id.in_(latest))).all():
        rows[t.merchant_id].append((t.txn_date, t.amount_inr, t.txn_count))
    names = dict(db.execute(select(models.Merchant.id, models.Merchant.name).where(models.Merchant.id.in_(latest))).all())

    per_merchant, by_action = [], defaultdict(list)
    for merchant_id, iv in latest.items():
        r = compute_impact(rows[merchant_id], _intervention_date(iv))
        if r.status != "ok":
            continue
        per_merchant.append({"merchant_id": merchant_id, "merchant_name": names[merchant_id], "action": iv.action,
                             "intervention_date": r.intervention_date.isoformat(), "change_pct": r.change_pct})
        by_action[iv.action].append(r.change_pct)
    per_merchant.sort(key=lambda x: x["change_pct"], reverse=True)
    all_changes = [x["change_pct"] for x in per_merchant]
    return {
        "label": "observed_change",
        "caveat": CAVEAT,
        "merchants_measured": len(per_merchant),
        "overall_avg_change_pct": round(sum(all_changes) / len(all_changes), 1) if all_changes else None,
        "by_action": {a: {"label": ACTION_LABELS.get(a, a), "merchants": len(v), "avg_change_pct": round(sum(v) / len(v), 1)}
                      for a, v in by_action.items()},
        "merchants": per_merchant,
    }
