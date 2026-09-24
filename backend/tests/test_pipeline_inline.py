import hashlib
import json

from app.config import settings
from app.services.pipeline import run_inline
from tests.factories import blurry_jpeg, make_visit, make_world, sharp_jpeg


def _pin(photo: bytes, preset: str):
    with open(settings.vision_fixtures_path, "w") as f:
        json.dump({"default": "non_compliant", "photos": {hashlib.sha256(photo).hexdigest(): preset}}, f)


def test_compliant_visit_earns_incentive(db):
    world = make_world(db)
    photo = sharp_jpeg(40)
    _pin(photo, "compliant")
    v = run_inline(db, make_visit(db, world, photo).id)
    assert (v.status, v.decision) == ("completed", "compliant")
    assert v.incentive.amount_inr == 50
    assert [s["step"] for s in v.pipeline_log] == ["fraud_check", "vision_ai", "merchant_context", "decision", "incentive", "complete"]


def test_non_compliant_visit_sends_hindi_whatsapp_guidance(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(41)).id)
    assert v.decision == "non_compliant" and v.status == "completed"
    assert v.intervention.message_language == "hi-IN"
    assert v.notifications[0].status == "dry_run"
    assert v.notifications[0].to_phone == world.merchant.phone


def test_blurry_visit_is_escalated_to_manager(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, blurry_jpeg()).id)
    assert (v.status, v.decision) == ("escalated", "low_confidence")
    assert v.escalation.status == "open"


def test_reused_photo_is_blocked(db):
    world = make_world(db)
    photo = sharp_jpeg(42)
    run_inline(db, make_visit(db, world, photo).id)
    v = run_inline(db, make_visit(db, world, photo).id)
    assert (v.status, v.decision) == ("blocked", "fraud")
    assert v.incentive is None and v.notifications == []


def test_far_away_visit_goes_to_review(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(43), lat=world.merchant.lat + 0.02, capture_source="unknown").id)
    assert v.authenticity_verdict == "REVIEW_REQUIRED"
    assert v.decision == "low_confidence"


def test_actions_are_idempotent(db):
    from app.services import actions

    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(44)).id)
    actions.send_whatsapp(db, v)
    actions.create_guidance(db, v, None)
    db.expire(v)
    assert len(v.notifications) == 1
