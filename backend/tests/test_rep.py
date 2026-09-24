from datetime import date, datetime

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.rep import coverage, fse_summary, performance, priority_queue

NOW = datetime(2026, 9, 25, 12, 0)


def _amit(db):
    return db.scalar(select(models.FseProfile).join(models.User, models.FseProfile.user_id == models.User.id)
                     .where(models.User.name == "Amit Patil"))


def test_queue_is_sorted_and_explains_itself(db):
    seed(db, today=date(2026, 9, 25))
    q = priority_queue(db, _amit(db).id, now=NOW)
    assert len(q) == 8
    assert [r["priority"] for r in q] == sorted((r["priority"] for r in q), reverse=True)
    ramesh = next(r for r in q if r["name"] == "Ramesh General Store")
    assert "Last QR score 42" in ramesh["reasons"]
    assert "Open issue: QR obstruction" in ramesh["reasons"]
    assert ramesh["days_since_visit"] == 20


def test_distance_changes_ranking(db):
    seed(db, today=date(2026, 9, 25))
    fse = _amit(db)
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    q = priority_queue(db, fse.id, lat=ramesh.lat, lng=ramesh.lng, now=NOW)
    assert next(r for r in q if r["merchant_id"] == ramesh.id)["distance_m"] == 0


def test_unusable_visit_today_does_not_hide_merchant(db):
    seed(db, today=date(2026, 9, 25))
    fse = _amit(db)
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    for status in ("blocked", "analyzing"):
        db.add(models.Visit(merchant_id=ramesh.id, fse_id=fse.id, lat=ramesh.lat, lng=ramesh.lng,
                            received_at=datetime(2026, 9, 25, 10, 0), status=status,
                            decision="blocked" if status == "blocked" else None))
    db.commit()
    q = priority_queue(db, fse.id, now=NOW)
    row = next(r for r in q if r["merchant_id"] == ramesh.id)
    assert row["days_since_visit"] == 20 and row["latest_score"] == 42
    # a completed visit today does count as visited today
    db.add(models.Visit(merchant_id=ramesh.id, fse_id=fse.id, lat=ramesh.lat, lng=ramesh.lng,
                        received_at=datetime(2026, 9, 25, 11, 0), status="completed", decision="compliant"))
    db.commit()
    assert all(r["merchant_id"] != ramesh.id for r in priority_queue(db, fse.id, now=NOW))


def test_coverage_and_performance(db):
    seed(db, today=date(2026, 9, 25))
    fse = _amit(db)
    assert coverage(db, fse.id, now=NOW) == {"assigned": 8, "visited": 8, "coverage_pct": 100.0}
    p = performance(db, fse.id, now=NOW)
    assert p["visits"] >= 8 and 0 <= p["verified_pct"] <= 100
    assert p["incentives_inr"] % 50 == 0
    s = fse_summary(db, fse.id, now=NOW)
    assert s["next_best"]["merchant_id"] == priority_queue(db, fse.id, now=NOW)[0]["merchant_id"]
    assert s["fse"]["name"] == "Amit Patil"


def test_api(client, db):
    seed(db, today=date(2026, 9, 25))
    fse_id = _amit(db).id
    assert len(client.get("/api/fse").json()) == 3
    assert client.get(f"/api/fse/{fse_id}/queue").status_code == 200
    assert "coverage" in client.get(f"/api/fse/{fse_id}/summary").json()
    assert isinstance(client.get(f"/api/fse/{fse_id}/visits?days=60").json(), list)
    assert client.get("/api/fse/999/summary").status_code == 404
    assert client.get(f"/api/fse/{fse_id}/visits?days=-1").status_code == 422
    assert client.get(f"/api/fse/{fse_id}/visits?days=100000").status_code == 422
