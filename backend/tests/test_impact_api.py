from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.impact import CAVEAT, portfolio_impact


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
    assert body["label"] == "observed_change" and body["caveat"] == CAVEAT
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
    assert body["label"] == "observed_change" and body["caveat"] == CAVEAT
    assert client.get("/api/merchants/9999/impact").status_code == 404


def test_intervention_id_selects_one_and_never_leaks_another_merchants(client, db):
    seed(db, today=date(2026, 9, 25))
    ramesh = _ramesh_id(db)
    ivs = db.scalars(select(models.Intervention).where(models.Intervention.merchant_id == ramesh)
                     .order_by(models.Intervention.created_at)).all()
    body = client.get(f"/api/merchants/{ramesh}/impact", params={"intervention_id": ivs[0].id}).json()
    assert body["intervention"]["action"] == "reposition_paytm_qr"
    assert body["impact"]["intervention_date"] == ivs[0].created_at.date().isoformat()

    other = db.scalar(select(models.Intervention).where(models.Intervention.merchant_id != ramesh).limit(1))
    assert client.get(f"/api/merchants/{ramesh}/impact", params={"intervention_id": other.id}).status_code == 404
    assert client.get(f"/api/merchants/{ramesh}/impact", params={"intervention_id": 99999}).status_code == 404


def test_portfolio_effectiveness(client, db):
    seed(db, today=date(2026, 9, 25))
    p = portfolio_impact(db)
    assert p["label"] == "observed_change" and p["caveat"] == CAVEAT and p["merchants_measured"] >= 1
    assert "clear_qr_obstruction" in p["by_action"]
    assert sum(a["merchants"] for a in p["by_action"].values()) == p["merchants_measured"] == len(p["merchants"])
    ramesh = next(r for r in p["merchants"] if r["merchant_name"] == "Ramesh General Store")
    assert 12 < ramesh["change_pct"] < 24
    assert client.get("/api/analytics/impact").status_code == 200


def test_portfolio_with_nothing_measurable(db):
    p = portfolio_impact(db)
    assert p["merchants_measured"] == 0 and p["overall_avg_change_pct"] is None
    assert p["by_action"] == {} and p["merchants"] == [] and p["caveat"] == CAVEAT


def test_new_visit_keeps_previous_measurable_impact_everywhere(client, db):
    """Demo step 3: a non-compliant visit today creates a fresh intervention with no post data. The impact endpoint,
    memory context and portfolio KPI keep using the previous measurable intervention and flag the new one as pending."""
    from types import SimpleNamespace

    from app.services.analytics import build_dashboard
    from app.services.memory import get_memory
    from app.services.pipeline import run_inline
    from tests.factories import make_visit, sharp_jpeg

    seed(db, today=date(2026, 9, 25))
    ramesh = db.get(models.Merchant, _ramesh_id(db))
    before_portfolio = portfolio_impact(db)
    before = client.get(f"/api/merchants/{ramesh.id}/impact").json()
    assert before["impact"]["change_pct"] == 17.5 and before["newer_intervention_pending"] is None

    world = SimpleNamespace(merchant=ramesh, fse=ramesh.fse)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(77)).id)
    assert v.decision == "non_compliant" and v.intervention is not None
    fresh = v.intervention

    body = client.get(f"/api/merchants/{ramesh.id}/impact").json()
    assert body["impact"]["status"] == "ok" and body["impact"]["change_pct"] == 17.5
    assert body["intervention"] == before["intervention"]
    pending = body["newer_intervention_pending"]
    assert pending["id"] == fresh.id and pending["action"] == fresh.action and pending["visit_id"] == v.id
    assert pending["date"] == fresh.created_at.date().isoformat()

    # The fresh one is still measurable on request, and reports insufficient_data (never extrapolated).
    explicit = client.get(f"/api/merchants/{ramesh.id}/impact", params={"intervention_id": fresh.id}).json()
    assert explicit["impact"]["status"] == "insufficient_data" and explicit["impact"]["change_pct"] is None
    assert explicit["newer_intervention_pending"] is None

    ctx = get_memory().get_context(db, ramesh.id)
    assert ctx.transaction_trend_pct == 17.5 and "observed transaction change +17.5%" in ctx.summary

    after_portfolio = portfolio_impact(db)
    assert after_portfolio == before_portfolio
    assert build_dashboard(db)["kpis"]["avg_observed_change_pct"] == before_portfolio["overall_avg_change_pct"]


def test_no_measurable_intervention_shows_latest_as_insufficient(client, db):
    from datetime import datetime, timedelta

    from app.services.impact import measurable_impact

    m = models.Merchant(name="Quiet Shop", owner_name="Q", phone="+91", language="hi-IN", lat=18.5, lng=73.8)
    db.add(m)
    db.flush()
    for i in range(3):  # a few days of baseline only: nothing after any intervention
        db.add(models.Transaction(merchant_id=m.id, txn_date=date(2026, 9, 20) + timedelta(days=i), amount_inr=1000.0, txn_count=10))
    old = models.Intervention(merchant_id=m.id, action="install_soundbox", issue="Soundbox missing", message_text_en="x",
                              message_text="x", message_language="hi-IN", created_at=datetime(2026, 9, 23, 9, 0))
    new = models.Intervention(merchant_id=m.id, action="clear_qr_obstruction", issue="QR obstruction", message_text_en="y",
                              message_text="y", message_language="hi-IN", created_at=datetime(2026, 9, 25, 9, 0))
    db.add_all([old, new])
    db.commit()

    assert measurable_impact(db, m.id) is None
    body = client.get(f"/api/merchants/{m.id}/impact").json()
    assert body["intervention"]["id"] == new.id and body["newer_intervention_pending"] is None
    assert body["impact"]["status"] == "insufficient_data" and body["impact"]["change_pct"] is None
    assert portfolio_impact(db)["merchants_measured"] == 0
