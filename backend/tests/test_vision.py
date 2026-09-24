import hashlib
import json

import pytest

from app.services.vision.engine import run_vision
from app.services.vision.fixture_provider import PRESETS, FixtureVisionProvider
from app.services.vision.quality import assess_quality
from app.services.vision.schema import CounterAudit, VisionUnavailable
from tests.factories import blurry_jpeg, dark_jpeg, make_visit, make_world, sharp_jpeg


def test_quality_gate():
    assert assess_quality(sharp_jpeg()).verdict == "ok"
    assert assess_quality(blurry_jpeg()).verdict == "blurry"
    assert assess_quality(dark_jpeg()).verdict == "dark"


def test_clamped_bounds_scores():
    a = PRESETS["compliant"].model_copy(update={"qr_visibility_score": 140, "confidence": 1.7})
    c = a.clamped()
    assert (c.qr_visibility_score, c.confidence) == (100, 1.0)


def test_fixture_provider_by_sha(tmp_path):
    photo = sharp_jpeg(4)
    path = tmp_path / "f.json"
    path.write_text(json.dumps({"default": "compliant", "photos": {hashlib.sha256(photo).hexdigest(): "non_compliant"}}))
    p = FixtureVisionProvider.from_file(path)
    assert p.analyze(photo, "image/jpeg").qr_visibility_score == 38
    assert p.analyze(sharp_jpeg(5), "image/jpeg").qr_visibility_score == 89


def test_fixture_provider_missing_file_uses_default(tmp_path):
    p = FixtureVisionProvider.from_file(tmp_path / "nope.json")
    assert p.analyze(sharp_jpeg(), "image/jpeg").recommended_action == "reposition_paytm_qr"


def test_run_vision_persists_audit(db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(20))
    audit = run_vision(db, v, provider=FixtureVisionProvider(default="non_compliant"))
    assert audit.qr_visibility_score == 38 and audit.competitor == "PhonePe"
    assert audit.image_quality == "ok" and audit.provider == "fixture"
    # re-run replaces rather than duplicates
    run_vision(db, v, provider=FixtureVisionProvider(default="compliant"))
    db.expire(v)
    assert v.audit.qr_visibility_score == 89


class _Boom:
    name = "boom"

    def analyze(self, image_bytes, media_type):
        raise AssertionError("provider must not be called for unusable images")


def test_blurry_photo_skips_provider_and_asks_for_retake(db):
    world = make_world(db)
    v = make_visit(db, world, blurry_jpeg())
    audit = run_vision(db, v, provider=_Boom())
    assert audit.image_quality == "blurry"
    assert audit.recommended_action == "retake_photo" and audit.confidence == 0.0
    assert audit.provider == "quality_gate"


class _Down:
    name = "down"

    def analyze(self, image_bytes, media_type):
        raise VisionUnavailable("timeout")


def test_provider_failure_degrades_to_low_confidence(db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(21))
    audit = run_vision(db, v, provider=_Down())
    assert audit.provider == "error" and "analysis_failed" in audit.suspicious_signals
