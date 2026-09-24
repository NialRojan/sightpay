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
