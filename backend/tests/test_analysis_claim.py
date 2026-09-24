import json
from datetime import timedelta
from pathlib import Path

import httpx
import pytest
import respx
from sqlalchemy.orm import sessionmaker

from app import models
from app.config import settings
from app.services import pipeline
from app.services.pipeline import NotAnalyzable, claim_for_analysis
from app.services.steps import append_step
from app.timeutil import utcnow
from tests.factories import make_visit, make_world, sharp_jpeg

HOOK = "http://n8n.test/webhook/sightpay-visit"


def _stuck(db, world, seconds_ago: int, seed: int = 90) -> models.Visit:
    v = make_visit(db, world, sharp_jpeg(seed))
    then = utcnow() - timedelta(seconds=seconds_ago)
    v.received_at = v.analysis_started_at = then
    v.status, v.pipeline_mode = "analyzing", "n8n"
    append_step(v, "queued", "Sent to n8n workflow")
    v.pipeline_log[-1]["at"] = then.isoformat()
    db.commit()
    return v


@respx.mock
def test_stale_analyzing_visit_is_recovered_inline(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    route = respx.post(HOOK).mock(return_value=httpx.Response(200))
    world = make_world(db)
    v = _stuck(db, world, seconds_ago=pipeline.STALE_ANALYZING_SECONDS + 30)
    res = client.post(f"/api/visits/{v.id}/analyze")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed" and body["pipeline_mode"] == "inline_recovery"
    assert "recovery" in [s["step"] for s in body["pipeline_log"]]
    assert not route.called  # recovery never goes back to n8n


def test_fresh_analyzing_visit_is_a_409(client, db):
    world = make_world(db)
    v = _stuck(db, world, seconds_ago=10)
    assert client.post(f"/api/visits/{v.id}/analyze").status_code == 409


def test_recent_pipeline_progress_keeps_visit_fresh(client, db):
    world = make_world(db)
    v = _stuck(db, world, seconds_ago=pipeline.STALE_ANALYZING_SECONDS + 30)
    append_step(v, "vision_ai", "n8n is still working")  # logged just now
    db.commit()
    assert client.post(f"/api/visits/{v.id}/analyze").status_code == 409


@respx.mock
def test_double_tap_runs_the_pipeline_once(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    route = respx.post(HOOK).mock(return_value=httpx.Response(200))
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(91))
    assert client.post(f"/api/visits/{v.id}/analyze").status_code == 200
    second = client.post(f"/api/visits/{v.id}/analyze")
    assert second.status_code == 409
    assert route.call_count == 1


def test_concurrent_claims_only_one_wins(db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(92))
    other = sessionmaker(bind=db.get_bind(), autoflush=False, expire_on_commit=False)()
    try:
        v_other = other.get(models.Visit, v.id)  # both callers have read "submitted"
        assert v_other.status == "submitted"
        assert claim_for_analysis(db, v) == "fresh"
        with pytest.raises(NotAnalyzable):
            claim_for_analysis(other, v_other)
    finally:
        other.close()


def test_concurrent_recoveries_only_one_wins(db):
    world = make_world(db)
    v = _stuck(db, world, seconds_ago=pipeline.STALE_ANALYZING_SECONDS + 30)
    other = sessionmaker(bind=db.get_bind(), autoflush=False, expire_on_commit=False)()
    try:
        v_other = other.get(models.Visit, v.id)
        assert claim_for_analysis(db, v) == "recovery"
        with pytest.raises(NotAnalyzable):
            claim_for_analysis(other, v_other)
    finally:
        other.close()


@respx.mock
def test_n8n_read_timeout_does_not_run_inline(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    monkeypatch.setattr(pipeline, "SessionLocal", lambda: db)
    respx.post(HOOK).mock(side_effect=httpx.ReadTimeout("slow"))
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(93))
    client.post(f"/api/visits/{v.id}/analyze")
    after = client.get(f"/api/visits/{v.id}").json()
    assert after["status"] == "analyzing" and after["pipeline_mode"] == "n8n"


@respx.mock
def test_n8n_connect_error_falls_back_inline(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    monkeypatch.setattr(pipeline, "SessionLocal", lambda: db)
    respx.post(HOOK).mock(side_effect=httpx.ConnectError("refused"))
    world = make_world(db)
    vid = make_visit(db, world, sharp_jpeg(94)).id
    client.post(f"/api/visits/{vid}/analyze")  # the fallback closes its session (here: the test session)
    after = client.get(f"/api/visits/{vid}").json()
    assert after["status"] == "completed" and after["pipeline_mode"] == "inline_fallback"


def test_retry_of_failed_visit_records_inline_mode(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(95))
    v.status, v.pipeline_mode = "failed", "inline_fallback"
    db.commit()
    body = client.post(f"/api/visits/{v.id}/analyze").json()
    assert body["status"] == "completed" and body["pipeline_mode"] == "inline"


def test_run_inline_refuses_a_finished_visit(db):
    world = make_world(db)
    v = pipeline.run_inline(db, make_visit(db, world, sharp_jpeg(96)).id)
    with pytest.raises(ValueError):
        pipeline.run_inline(db, v.id)


def test_claude_worst_case_fits_under_n8n_vision_timeout():
    from app.services.vision import claude_provider as cp

    wf = json.loads((Path(__file__).parents[2] / "n8n/workflows/sightpay_visit_pipeline.json").read_text())
    vision = next(n for n in wf["nodes"] if "/vision" in json.dumps(n.get("parameters", {})))
    n8n_ms = vision["parameters"]["options"]["timeout"]
    assert cp.CLIENT_TIMEOUT_S * (cp.CLIENT_MAX_RETRIES + 1) * 1000 < n8n_ms


def test_malformed_webhook_url_falls_back_inline(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", "localhost:5678/webhook/sightpay-visit")  # no scheme
    monkeypatch.setattr(pipeline, "SessionLocal", lambda: db)
    world = make_world(db)
    vid = make_visit(db, world, sharp_jpeg(97)).id
    client.post(f"/api/visits/{vid}/analyze")
    after = client.get(f"/api/visits/{vid}").json()
    assert after["status"] == "completed" and after["pipeline_mode"] == "inline_fallback"
