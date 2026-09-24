# SightPay Backend P2 — Transaction Impact Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For every intervention, compute the 14-day baseline, the post-intervention average and the observed % change in a merchant's daily transactions. Serve before/after series for charts, and aggregate intervention effectiveness. Feed the trend back into merchant memory, so the AI and the rep can say things like "QR repositioned → +17.8% observed".

**Architecture:** A pure function `compute_impact` over a list of daily `(date, amount, count)` rows is fully unit-testable with no database. A thin service loads rows and interventions from SQL. Endpoints expose per-merchant impact and portfolio effectiveness. `SqlMemory` attaches the latest observed change to `MerchantContext`, so it flows into the decision reasons, voice answers and the Cognee documents automatically.

**Tech Stack:** P0/P1 stack. No new dependencies.

**Spec:** `docs/spec-person-b.md` section 7 (Transaction Impact Engine) and Phase 5 (Impact Layer). **Prerequisite:** P0 complete. P1 is optional; the P1 voice answers already print `transaction_trend_pct` when it is set.

## Global Constraints

- Always label results `"observed_change"` and ship this caveat string in every response: "Observed change around the intervention date. This is not proof that the intervention caused it: seasonality, festivals and other factors also move sales."
- Baseline = the 14 days strictly before the intervention date. Post = up to 14 days strictly after it. The intervention day itself is excluded.
- If either window has fewer than 3 days of data, `status = "insufficient_data"` and `change_pct = null`. Never extrapolate.
- Money is INR, rounded to 2 decimals. Percentages are rounded to 1 decimal.

## File Structure

```
backend/app/services/impact.py       # ImpactResult, compute_impact, merchant_impact, latest_impact, portfolio_impact
backend/app/api/merchants.py         # + GET /merchants/{id}/impact
backend/app/api/analytics.py         # + GET /analytics/impact
backend/app/services/memory/sql_memory.py   # + transaction_trend_pct
backend/app/services/analytics.py    # + avg_observed_change_pct KPI
backend/tests/test_impact.py test_impact_api.py
```

---

### Task 1: Pure impact calculation

**Files:**
- Create: `backend/app/services/impact.py`
- Test: `backend/tests/test_impact.py`

**Interfaces:**
- Produces: `CAVEAT: str`, `ImpactResult` (a dataclass with fields `intervention_date, baseline_start, baseline_end, post_start, post_end, baseline_days, post_days, baseline_avg_daily_inr, post_avg_daily_inr, change_inr, change_pct, baseline_avg_txn_count, post_avg_txn_count, status, label, caveat`, and a `.to_dict()` that returns ISO dates), `compute_impact(rows: list[tuple[date, float, int]], intervention_date: date, window_days=14, min_days=3) -> ImpactResult`.

- [ ] **Step 1: Write the failing test `backend/tests/test_impact.py`**

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_impact.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.impact'`

- [ ] **Step 3: Implement `compute_impact` in `backend/app/services/impact.py`**

```python
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


def _avg(xs: list[float], ndigits: int = 2) -> float | None:
    return round(sum(xs) / len(xs), ndigits) if xs else None


def compute_impact(rows: list[tuple[date, float, int]], intervention_date: date, window_days: int = 14, min_days: int = 3) -> ImpactResult:
    b_start, b_end = intervention_date - timedelta(days=window_days), intervention_date - timedelta(days=1)
    p_start, p_end = intervention_date + timedelta(days=1), intervention_date + timedelta(days=window_days)
    base = [(a, c) for d, a, c in rows if b_start <= d <= b_end]
    post = [(a, c) for d, a, c in rows if p_start <= d <= p_end]

    b_avg, p_avg = _avg([a for a, _ in base]), _avg([a for a, _ in post])
    ok = len(base) >= min_days and len(post) >= min_days and b_avg
    change_inr = round(p_avg - b_avg, 2) if ok else None
    change_pct = round(100 * (p_avg - b_avg) / b_avg, 1) if ok else None
    return ImpactResult(
        intervention_date=intervention_date, baseline_start=b_start, baseline_end=b_end, post_start=p_start, post_end=p_end,
        baseline_days=len(base), post_days=len(post), baseline_avg_daily_inr=b_avg, post_avg_daily_inr=p_avg,
        change_inr=change_inr, change_pct=change_pct,
        baseline_avg_txn_count=_avg([c for _, c in base], 1), post_avg_txn_count=_avg([c for _, c in post], 1),
        status="ok" if ok else "insufficient_data",
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_impact.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/impact.py backend/tests/test_impact.py
git commit -m "feat(impact): 14-day baseline vs post-intervention observed change calculation"
```

---

### Task 2: Merchant impact and portfolio effectiveness endpoints

**Files:**
- Modify: `backend/app/services/impact.py` (DB-backed functions), `backend/app/api/merchants.py`, `backend/app/api/analytics.py`
- Test: `backend/tests/test_impact_api.py`

**Interfaces:**
- Consumes: `compute_impact`, `ImpactResult`, models, `ACTION_LABELS`.
- Produces:
  - `load_rows(db, merchant_id) -> list[tuple[date, float, int]]`
  - `merchant_impact(db, merchant_id, intervention_id=None) -> dict | None` returns `{merchant_id, merchant_name, intervention, impact, series}`, or `None` if the merchant is unknown. `intervention` and `impact` are `null` when there is no intervention
  - `latest_impact(db, merchant_id) -> ImpactResult | None`
  - `portfolio_impact(db) -> dict` returns `{label, caveat, overall_avg_change_pct, merchants_measured, by_action: {action: {label, merchants, avg_change_pct}}, merchants: [...]}`
  - Routes: `GET /api/merchants/{id}/impact?intervention_id=` and `GET /api/analytics/impact`

- [ ] **Step 1: Write the failing test `backend/tests/test_impact_api.py`**

```python
from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.impact import portfolio_impact


def _ramesh_id(db):
    return db.scalar(select(models.Merchant.id).where(models.Merchant.name == "Ramesh General Store"))


def test_ramesh_observed_change(client, db):
    seed(db, today=date(2026, 9, 25))
    body = client.get(f"/api/merchants/{_ramesh_id(db)}/impact").json()
    imp = body["impact"]
    assert imp["status"] == "ok" and imp["label"] == "observed_change"
    assert 4000 < imp["baseline_avg_daily_inr"] < 4400 and 4750 < imp["post_avg_daily_inr"] < 5150
    assert 12 < imp["change_pct"] < 24
    assert body["intervention"]["action"] == "clear_qr_obstruction"
    assert body["intervention"]["issue"] == "QR obstruction"
    # chart series spans baseline start → post end and marks the phase of each day
    phases = {p["phase"] for p in body["series"]}
    assert phases == {"baseline", "intervention", "post"}


def test_merchant_without_intervention_and_unknown_merchant(client, db):
    seed(db, today=date(2026, 9, 25))
    m = models.Merchant(name="Brand New Shop", owner_name="X", phone="+91", language="hi-IN", lat=18.5, lng=73.8)
    db.add(m)
    db.commit()
    body = client.get(f"/api/merchants/{m.id}/impact").json()
    assert body["impact"] is None and body["intervention"] is None
    assert client.get("/api/merchants/9999/impact").status_code == 404


def test_portfolio_effectiveness(client, db):
    seed(db, today=date(2026, 9, 25))
    p = portfolio_impact(db)
    assert p["label"] == "observed_change" and p["merchants_measured"] >= 1
    assert "clear_qr_obstruction" in p["by_action"]
    ramesh = next(r for r in p["merchants"] if r["merchant_name"] == "Ramesh General Store")
    assert 12 < ramesh["change_pct"] < 24
    assert client.get("/api/analytics/impact").status_code == 200
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_impact_api.py -v`
Expected: FAIL (404 on `/impact`)

- [ ] **Step 3: Append the DB-backed functions to `backend/app/services/impact.py`**

```python
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.labels import ACTION_LABELS


def load_rows(db: Session, merchant_id: int) -> list[tuple[date, float, int]]:
    rows = db.scalars(
        select(models.Transaction).where(models.Transaction.merchant_id == merchant_id).order_by(models.Transaction.txn_date)
    ).all()
    return [(r.txn_date, r.amount_inr, r.txn_count) for r in rows]


def _latest_intervention(db: Session, merchant_id: int) -> models.Intervention | None:
    return db.scalars(
        select(models.Intervention).where(models.Intervention.merchant_id == merchant_id)
        .order_by(models.Intervention.created_at.desc()).limit(1)
    ).first()


def latest_impact(db: Session, merchant_id: int) -> ImpactResult | None:
    iv = _latest_intervention(db, merchant_id)
    return compute_impact(load_rows(db, merchant_id), iv.created_at.date()) if iv else None


def merchant_impact(db: Session, merchant_id: int, intervention_id: int | None = None) -> dict | None:
    m = db.get(models.Merchant, merchant_id)
    if m is None:
        return None
    iv = db.get(models.Intervention, intervention_id) if intervention_id else _latest_intervention(db, merchant_id)
    if iv is None or iv.merchant_id != merchant_id:
        return {"merchant_id": m.id, "merchant_name": m.name, "intervention": None, "impact": None, "series": []}
    rows = load_rows(db, merchant_id)
    result = compute_impact(rows, iv.created_at.date())
    series = []
    for d, amount, count in rows:
        if result.baseline_start <= d <= result.post_end:
            phase = "baseline" if d < result.intervention_date else ("intervention" if d == result.intervention_date else "post")
            series.append({"date": d.isoformat(), "amount_inr": amount, "txn_count": count, "phase": phase})
    return {
        "merchant_id": m.id,
        "merchant_name": m.name,
        "intervention": {"id": iv.id, "action": iv.action, "issue": iv.issue, "date": iv.created_at.date().isoformat(),
                         "visit_id": iv.visit_id, "message_text": iv.message_text},
        "impact": result.to_dict(),
        "series": series,
    }


def portfolio_impact(db: Session) -> dict:
    per_merchant, by_action = [], defaultdict(list)
    for m in db.scalars(select(models.Merchant)).all():
        iv = _latest_intervention(db, m.id)
        if iv is None:
            continue
        r = compute_impact(load_rows(db, m.id), iv.created_at.date())
        if r.status != "ok":
            continue
        per_merchant.append({"merchant_id": m.id, "merchant_name": m.name, "action": iv.action,
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
```
Move the new imports to the top of the file with the existing ones.

- [ ] **Step 4: Add the routes**

In `backend/app/api/merchants.py`:
```python
from app.services.impact import merchant_impact


@router.get("/{merchant_id}/impact")
def impact(merchant_id: int, intervention_id: int | None = None, db: Session = Depends(get_db)):
    body = merchant_impact(db, merchant_id, intervention_id)
    if body is None:
        raise HTTPException(404, "Merchant not found")
    return body
```

In `backend/app/api/analytics.py`:
```python
from app.services.impact import portfolio_impact


@router.get("/analytics/impact")
def impact(db: Session = Depends(get_db)):
    return portfolio_impact(db)
```

Seeded non-Ramesh merchants get flat random transactions, so their observed change hovers near 0%. That is honest: only Ramesh has a scripted story.

- [ ] **Step 5: Run the tests**

Run: `pytest -v`
Expected: all PASS

- [ ] **Step 6: Extend the contract route test**

In `backend/tests/test_contract_paths.py`, add `("GET", "/api/merchants/{merchant_id}/impact")` to `REQUIRED`. Run `pytest tests/test_contract_paths.py -v` and expect PASS.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(impact): merchant before/after impact and portfolio intervention effectiveness endpoints"
```

---

### Task 3: Feed observed change into memory, decisions and the dashboard

**Files:**
- Modify: `backend/app/services/memory/sql_memory.py`, `backend/app/services/analytics.py`, `docs/api-contract.md`
- Modify (only if P1 Task 6 is done): `backend/app/services/memory/cognee_memory.py` (`visit_memory_document`)
- Test: add to `backend/tests/test_memory.py` and `backend/tests/test_read_apis.py`

**Interfaces:**
- Consumes: `latest_impact`, `portfolio_impact`.
- Produces: `MerchantContext.transaction_trend_pct` is filled when the latest intervention has `status == "ok"`, and the summary includes "observed transaction change +x%". `build_dashboard` KPIs gain `avg_observed_change_pct`. The Cognee document gains the line `Transaction trend after intervention: +x% (observed)`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_memory.py`:
```python
def test_context_includes_observed_transaction_change(db):
    seed(db, today=date(2026, 9, 25))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    ctx = get_memory().get_context(db, ramesh.id)
    assert 12 < ctx.transaction_trend_pct < 24
    assert "observed transaction change +" in ctx.summary
```

Append to `backend/tests/test_read_apis.py`:
```python
def test_dashboard_reports_observed_change(db):
    seed(db, today=date(2026, 9, 25))
    d = build_dashboard(db, now=datetime(2026, 9, 25, 12, 0))
    assert d["kpis"]["avg_observed_change_pct"] is not None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_memory.py tests/test_read_apis.py -v`
Expected: FAIL. `transaction_trend_pct` is `None` and the KPI key is missing.

- [ ] **Step 3: Set the trend in `SqlMemory.get_context`**

In `backend/app/services/memory/sql_memory.py`, just before `ctx.summary = summarize(ctx)`:
```python
        impact = latest_impact(db, merchant_id)
        if impact is not None and impact.status == "ok":
            ctx.transaction_trend_pct = impact.change_pct
```
Add `from app.services.impact import latest_impact` at the top. `summarize` already prints `observed transaction change {pct:+.1f}%` when the value is set.

- [ ] **Step 4: Add the KPI in `backend/app/services/analytics.py`**

Inside `build_dashboard`, after building `kpis`:
```python
    kpis["avg_observed_change_pct"] = portfolio_impact(db)["overall_avg_change_pct"]
```
Add `from app.services.impact import portfolio_impact` at the top.

- [ ] **Step 5: Add the trend to Cognee documents (skip if P1 Task 6 is not done)**

In `visit_memory_document`, before the `Outcome` line:
```python
    if visit.intervention:
        from app.services.impact import compute_impact, load_rows
        from sqlalchemy.orm import object_session

        r = compute_impact(load_rows(object_session(visit), visit.merchant_id), visit.intervention.created_at.date())
        if r.status == "ok":
            lines.append(f"Transaction trend after intervention: {r.change_pct:+.1f}% (observed, not causal)")
```

- [ ] **Step 6: Run the full suite**

Run: `pytest -v`
Expected: all PASS. The P0 `test_sql_memory_recalls_ramesh_history` still passes because it does not assert on the trend.

- [ ] **Step 7: Update `docs/api-contract.md`**

```markdown
## Impact (observed change — never label as causal uplift)
- `GET /merchants/{id}/impact?intervention_id=` → {merchant_id, merchant_name,
  intervention {id, action, issue, date, visit_id, message_text} | null,
  impact {intervention_date, baseline_start, baseline_end, post_start, post_end, baseline_days, post_days,
          baseline_avg_daily_inr, post_avg_daily_inr, change_inr, change_pct, baseline_avg_txn_count,
          post_avg_txn_count, status ok|insufficient_data, label "observed_change", caveat} | null,
  series [{date, amount_inr, txn_count, phase baseline|intervention|post}]}
  UI: show `caveat` under the chart; show "Observed change", never "uplift caused by".
- `GET /analytics/impact` → {label, caveat, merchants_measured, overall_avg_change_pct,
  by_action {action: {label, merchants, avg_change_pct}}, merchants [{merchant_id, merchant_name, action, intervention_date, change_pct}]}
- `GET /dashboard` kpis gain `avg_observed_change_pct`; `merchant.context.transaction_trend_pct` is now populated.
```

- [ ] **Step 8: Commit**

```bash
git add backend docs/api-contract.md
git commit -m "feat(impact): observed transaction change in merchant memory, voice answers and dashboard"
```

---

## Demo script (all phases)

1. **Setup:** Seed with the venue location: `python -m app.seed --demo-location <lat>,<lng>`. Start n8n and the backend with `VISION_PROVIDER=claude`, `SARVAM_API_KEY`, `WHATSAPP_MODE=twilio`, `WHATSAPP_DEMO_TO` and `MEMORY_BACKEND=cognee`.
2. **Merchant page:** Open Ramesh General Store. Memory shows score 42 and "QR obstruction". Impact shows ₹4,200 → ₹4,950/day, **+17.9% observed change**.
3. **Bad counter:** The rep photographs a bad counter. n8n executes live: Fraud 90/100 VERIFIED → Vision score 38, PhonePe high → Cognee context → Non-compliant → Sarvam Hindi voice note → WhatsApp arrives on the demo phone.
4. **Fixed counter:** The rep fixes the counter and photographs again. Compliant, "Improved from previous score 42 to 89", ₹50 incentive.
5. **Reused photo:** Re-upload the first photo. Duplicate perceptual hash → BLOCKED.
6. **Manager review:** A blurry photo goes to Manager Escalation. The manager approves on the dashboard.
7. **Voice:** Rep asks "Aaj mujhe kaunse merchants visit karne hain?" and gets a Hindi voice answer from the priority queue.
