from datetime import date, timedelta

from sqlalchemy import func, select

from app import models
from app.seed import seed


def test_seed_creates_living_demo_world(db):
    today = date(2026, 9, 25)
    counts = seed(db, today=today)

    assert counts["merchants"] == 24
    assert counts["fse_profiles"] == 3
    assert db.scalar(select(func.count()).select_from(models.Transaction)) == 24 * 60

    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    assert ramesh.language == "hi-IN"
    assert ramesh.fse.user.name == "Amit Patil"

    # Ramesh's story: last audit score 42 with QR obstruction, then an intervention
    last = db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == ramesh.id).order_by(models.Visit.received_at.desc())
    ).first()
    assert last.audit.qr_visibility_score == 42
    assert last.audit.recommended_action == "clear_qr_obstruction"
    assert last.intervention is not None

    # Transactions: ~₹4,200/day before, ~₹4,950/day after the intervention
    cut = today - timedelta(days=20)
    rows = db.scalars(select(models.Transaction).where(models.Transaction.merchant_id == ramesh.id)).all()
    before = [r.amount_inr for r in rows if cut - timedelta(days=14) <= r.txn_date < cut]
    after = [r.amount_inr for r in rows if r.txn_date > cut]
    change = (sum(after) / len(after)) / (sum(before) / len(before)) - 1
    assert 0.12 < change < 0.24

    assert db.scalar(select(func.count()).select_from(models.Escalation).where(models.Escalation.status == "open")) >= 1


def test_seed_demo_location_moves_every_merchant_to_the_venue(db):
    from app.services.fraud.signals import haversine_m

    venue = (12.9716, 77.5946)
    seed(db, today=date(2026, 9, 25), demo_location=venue)
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    assert (ramesh.lat, ramesh.lng) == venue
    merchants = db.scalars(select(models.Merchant)).all()
    assert len(merchants) == 24
    for m in merchants:
        assert haversine_m(m.lat, m.lng, *venue) <= 150, m.name
    assert len({(m.lat, m.lng) for m in merchants}) == 24  # no two merchants on the same spot
