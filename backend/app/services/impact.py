from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta

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
