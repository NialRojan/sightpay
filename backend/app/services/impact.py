from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta

from sqlalchemy import or_, select
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


def load_rows(db: Session, merchant_id: int, start: date | None = None, end: date | None = None) -> list[tuple[date, float, int]]:
    q = select(models.Transaction).where(models.Transaction.merchant_id == merchant_id)
    if start is not None:
        q = q.where(models.Transaction.txn_date >= start)
    if end is not None:
        q = q.where(models.Transaction.txn_date <= end)
    rows = db.scalars(q.order_by(models.Transaction.txn_date)).all()
    return [(r.txn_date, r.amount_inr, r.txn_count) for r in rows]


def intervention_impact(db: Session, iv: models.Intervention, window_days: int = 14) -> ImpactResult:
    """Observed change around one intervention, loading only the rows inside its baseline/post windows (one query)."""
    d = _intervention_date(iv)
    rows = load_rows(db, iv.merchant_id, d - timedelta(days=window_days), d + timedelta(days=window_days))
    return compute_impact(rows, d, window_days=window_days)


# How many recent interventions are considered when looking for one that is measurable. Bounded on purpose: an
# intervention older than a few visits is no longer a fair picture of the merchant's current state.
MEASURABLE_LOOKBACK = 5


def _recent_interventions(db: Session, merchant_id: int, exclude_visit_id: int | None = None,
                          limit: int = MEASURABLE_LOOKBACK) -> list[models.Intervention]:
    """The merchant's most recent interventions, newest first (created_at desc, id desc)."""
    q = select(models.Intervention).where(models.Intervention.merchant_id == merchant_id)
    if exclude_visit_id is not None:
        # visit_id is nullable: a plain != would also drop interventions that have no visit.
        q = q.where(or_(models.Intervention.visit_id.is_(None), models.Intervention.visit_id != exclude_visit_id))
    return list(db.scalars(q.order_by(models.Intervention.created_at.desc(), models.Intervention.id.desc()).limit(limit)).all())


def _first_measurable(ivs: list[models.Intervention], rows: list[tuple[date, float, int]],
                      window_days: int = 14) -> tuple[models.Intervention, ImpactResult] | None:
    """First intervention in `ivs` (already newest first) whose observed change has status "ok"."""
    for iv in ivs:
        r = compute_impact(rows, _intervention_date(iv), window_days=window_days)
        if r.status == "ok":
            return iv, r
    return None


def _measurable_among(db: Session, merchant_id: int, ivs: list[models.Intervention],
                      window_days: int = 14) -> tuple[models.Intervention, ImpactResult] | None:
    if not ivs:
        return None
    dates = [_intervention_date(iv) for iv in ivs]
    # One query covering every candidate's baseline and post window.
    rows = load_rows(db, merchant_id, min(dates) - timedelta(days=window_days), max(dates) + timedelta(days=window_days))
    return _first_measurable(ivs, rows, window_days)


def measurable_impact(db: Session, merchant_id: int, exclude_visit_id: int | None = None,
                      window_days: int = 14) -> tuple[models.Intervention, ImpactResult] | None:
    """The merchant's most recent intervention that has enough data for an observed change (status "ok"), with that
    result. A fresh intervention (no post window yet) is skipped in favour of the previous measurable one, looking back
    at most MEASURABLE_LOOKBACK interventions. `exclude_visit_id` ignores the intervention made by the visit being
    analyzed. None if none is measurable. Two queries: interventions, then the transactions of all their windows."""
    ivs = _recent_interventions(db, merchant_id, exclude_visit_id)
    return _measurable_among(db, merchant_id, ivs, window_days)


def _intervention_body(iv: models.Intervention, **extra) -> dict:
    return {"id": iv.id, "action": iv.action, "issue": iv.issue, "date": _intervention_date(iv).isoformat(),
            "visit_id": iv.visit_id, **extra}


def merchant_impact(db: Session, merchant_id: int, intervention_id: int | None = None) -> dict | None:
    """Before/after impact for one merchant. None if the merchant is unknown; raises InterventionNotFound
    if `intervention_id` is given but is not one of this merchant's interventions.

    Without `intervention_id` it measures the most recent intervention that is measurable; if a newer one is still
    collecting post-window data it is reported in `newer_intervention_pending`. If none is measurable, the latest
    intervention is shown with status insufficient_data."""
    m = db.get(models.Merchant, merchant_id)
    if m is None:
        return None
    pending = None
    if intervention_id is not None:
        iv = db.get(models.Intervention, intervention_id)
        if iv is None or iv.merchant_id != merchant_id:
            raise InterventionNotFound(intervention_id)
    else:
        ivs = _recent_interventions(db, merchant_id)
        found = _measurable_among(db, merchant_id, ivs)
        iv = found[0] if found else (ivs[0] if ivs else None)
        if found and ivs[0] is not iv:
            pending = ivs[0]
    body = {"merchant_id": m.id, "merchant_name": m.name, "label": "observed_change", "caveat": CAVEAT,
            "intervention": None, "newer_intervention_pending": None, "impact": None, "series": []}
    if iv is None:
        return body
    d = _intervention_date(iv)
    rows = load_rows(db, merchant_id, d - timedelta(days=14), d + timedelta(days=14))
    result = compute_impact(rows, d)
    series = []
    for day, amount, count in rows:
        phase = "baseline" if day < d else ("intervention" if day == d else "post")
        series.append({"date": day.isoformat(), "amount_inr": amount, "txn_count": count, "phase": phase})
    body["intervention"] = _intervention_body(iv, message_text=iv.message_text)
    body["newer_intervention_pending"] = _intervention_body(pending) if pending else None
    body["impact"] = result.to_dict()
    body["series"] = series
    return body


def portfolio_impact(db: Session) -> dict:
    """Average observed change per action, over each merchant's most recent measurable intervention (see
    measurable_impact). Merchants with no measurable intervention are left out."""
    recent: dict[int, list[models.Intervention]] = defaultdict(list)
    for iv in db.scalars(select(models.Intervention)
                         .order_by(models.Intervention.created_at.desc(), models.Intervention.id.desc())).all():
        if len(recent[iv.merchant_id]) < MEASURABLE_LOOKBACK:
            recent[iv.merchant_id].append(iv)
    rows: dict[int, list[tuple[date, float, int]]] = defaultdict(list)
    if recent:
        earliest = min(_intervention_date(iv) for ivs in recent.values() for iv in ivs) - timedelta(days=14)
        for t in db.scalars(select(models.Transaction).where(models.Transaction.merchant_id.in_(recent),
                                                             models.Transaction.txn_date >= earliest)).all():
            rows[t.merchant_id].append((t.txn_date, t.amount_inr, t.txn_count))
    names = dict(db.execute(select(models.Merchant.id, models.Merchant.name).where(models.Merchant.id.in_(recent))).all())

    per_merchant, by_action = [], defaultdict(list)
    for merchant_id, ivs in recent.items():
        found = _first_measurable(ivs, rows[merchant_id])
        if found is None:
            continue
        iv, r = found
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
