from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.memory import get_memory


def test_sql_memory_recalls_ramesh_history(db):
    seed(db, today=date(2026, 9, 25))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    ctx = get_memory().get_context(db, ramesh.id)
    assert ctx.previous_scores == [42, 38]
    assert ctx.previous_issues[0] == "QR obstruction"
    assert ctx.previous_interventions[0] == "clear_qr_obstruction"
    assert ctx.consecutive_non_compliant == 2
    assert ctx.rep_name == "Amit Patil"
    assert "42" in ctx.summary and "QR obstruction" in ctx.summary
    assert ctx.to_dict()["last_visit_at"].startswith("2026-09-05")


def _pin(photos: dict[bytes, str]):
    import hashlib
    import json

    from app.config import settings

    with open(settings.vision_fixtures_path, "w") as f:
        json.dump({"default": "non_compliant", "photos": {hashlib.sha256(p).hexdigest(): k for p, k in photos.items()}}, f)


def test_unusable_and_fraud_visits_do_not_feed_memory(db):
    from app.services.pipeline import run_inline
    from tests.factories import blurry_jpeg, make_visit, make_world, sharp_jpeg

    world = make_world(db)
    good = sharp_jpeg(100)
    _pin({good: "compliant"})
    nc = run_inline(db, make_visit(db, world, sharp_jpeg(101)).id)
    assert nc.decision == "non_compliant"
    blurry = blurry_jpeg()
    assert run_inline(db, make_visit(db, world, blurry).id).status == "escalated"
    assert run_inline(db, make_visit(db, world, blurry).id).status == "blocked"  # reused photo

    ctx = get_memory().get_context(db, world.merchant.id)
    assert ctx.previous_scores == [38]
    assert ctx.consecutive_non_compliant == 1  # escalated/blocked visits neither break nor extend the streak
    assert ctx.last_visit_at == nc.received_at

    v = run_inline(db, make_visit(db, world, good).id)
    assert v.decision == "compliant"
    assert not any("previous score 0" in r for r in v.decision_reasons)
    assert "Improved from previous score 38 to 89" in v.decision_reasons


def test_fraud_visits_are_not_recorded_in_memory(db, monkeypatch):
    from app.services import actions
    from app.services.pipeline import run_inline
    from tests.factories import make_visit, make_world, sharp_jpeg

    recorded = []

    class Spy:
        def get_context(self, *a, **kw):
            from app.services.memory.sql_memory import SqlMemory
            return SqlMemory().get_context(*a, **kw)

        def record_visit_outcome(self, db, visit):
            recorded.append(visit.decision)

    monkeypatch.setattr(actions, "get_memory", lambda: Spy())
    world = make_world(db)
    photo = sharp_jpeg(102)
    run_inline(db, make_visit(db, world, photo).id)
    assert run_inline(db, make_visit(db, world, photo).id).decision == "fraud"
    assert recorded == ["non_compliant"]


def test_context_includes_observed_transaction_change(db):
    seed(db, today=date(2026, 9, 25))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    ctx = get_memory().get_context(db, ramesh.id)
    assert 12 < ctx.transaction_trend_pct < 24
    assert "observed transaction change +" in ctx.summary


def test_trend_skips_the_intervention_of_the_visit_being_analyzed(db):
    """A visit's own guidance (e.g. on a re-run) has no post window yet; it must not hide the previous observed change."""
    from datetime import datetime

    seed(db, today=date(2026, 9, 25))
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    old = db.scalars(select(models.Visit).where(models.Visit.merchant_id == ramesh.id)).first()
    now = datetime(2026, 9, 25, 10, 0)
    visit = models.Visit(merchant_id=ramesh.id, fse_id=old.fse_id, lat=0.0, lng=0.0, client_captured_at=now,
                         received_at=now, capture_source="camera", status="analyzing", pipeline_log=[])
    db.add(visit)
    db.flush()
    db.add(models.Intervention(merchant_id=ramesh.id, visit_id=visit.id, action="clear_qr_obstruction", issue="QR obstruction",
                               message_text_en="x", message_text="x", message_language="hi-IN", created_at=now))
    db.commit()

    during_run = get_memory().get_context(db, ramesh.id, exclude_visit_id=visit.id)
    assert 12 < during_run.transaction_trend_pct < 24
    # Without the exclusion today's intervention is the latest but has no post data yet, so the previous measurable
    # one is used instead (never an extrapolated value for today's).
    assert get_memory().get_context(db, ramesh.id).transaction_trend_pct == during_run.transaction_trend_pct
