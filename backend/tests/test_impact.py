from datetime import date, timedelta

from app.services.impact import CAVEAT, compute_impact

D = date(2026, 9, 5)


def _rows(before: float, after: float, days_before=14, days_after=14, on_day=None):
    rows = [(D - timedelta(days=i), before, 30) for i in range(1, days_before + 1)]
    rows += [(D + timedelta(days=i), after, 36) for i in range(1, days_after + 1)]
    if on_day is not None:
        rows.append((D, on_day, 99))
    return rows


def test_spec_example_4200_to_4950_is_plus_17_9_pct():
    r = compute_impact(_rows(4200, 4950), D)
    assert (r.baseline_avg_daily_inr, r.post_avg_daily_inr) == (4200.0, 4950.0)
    assert r.change_inr == 750.0 and r.change_pct == 17.9
    assert (r.baseline_avg_txn_count, r.post_avg_txn_count) == (30.0, 36.0)
    assert r.status == "ok" and r.label == "observed_change" and r.caveat == CAVEAT


def test_windows_exclude_intervention_day_and_cap_at_14_days():
    rows = _rows(1000, 1000, days_before=30, days_after=30, on_day=1_000_000)
    r = compute_impact(rows, D)
    assert r.change_pct == 0.0 and r.baseline_days == 14 and r.post_days == 14
    assert r.baseline_start == D - timedelta(days=14) and r.baseline_end == D - timedelta(days=1)
    assert r.post_start == D + timedelta(days=1) and r.post_end == D + timedelta(days=14)


def test_partial_post_window_still_ok_with_3_days():
    r = compute_impact(_rows(1000, 1100, days_after=3), D)
    assert r.status == "ok" and r.post_days == 3 and r.change_pct == 10.0


def test_too_little_data_is_insufficient_not_extrapolated():
    r = compute_impact(_rows(1000, 1500, days_after=2), D)
    assert r.status == "insufficient_data" and r.change_pct is None and r.post_avg_daily_inr == 1500.0


def test_negative_change_and_zero_baseline():
    assert compute_impact(_rows(1000, 900), D).change_pct == -10.0
    r = compute_impact(_rows(0, 500), D)
    assert r.status == "insufficient_data" and r.change_pct is None


def test_to_dict_is_json_friendly():
    d = compute_impact(_rows(4200, 4950), D).to_dict()
    assert d["intervention_date"] == "2026-09-05" and d["change_pct"] == 17.9
