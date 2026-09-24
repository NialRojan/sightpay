import json

import httpx
import respx

from app.config import settings
from app.services import pipeline
from tests.factories import make_world, sharp_jpeg

HOOK = "http://n8n.test/webhook/sightpay-visit"


def _create(client, world):
    return client.post(
        "/api/visits",
        data={"merchant_id": world.merchant.id, "fse_id": world.fse.id, "lat": world.merchant.lat,
              "lng": world.merchant.lng, "capture_source": "camera"},
        files={"photo": ("c.jpg", sharp_jpeg(70), "image/jpeg")},
    ).json()


@respx.mock
def test_analyze_hands_off_to_n8n(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    route = respx.post(HOOK).mock(return_value=httpx.Response(200, json={"ok": True}))
    world = make_world(db)
    v = _create(client, world)
    body = client.post(f"/api/visits/{v['id']}/analyze").json()
    assert body["status"] == "analyzing" and body["pipeline_mode"] == "n8n"
    assert route.called
    assert json.loads(route.calls[0].request.content) == {"visit_id": v["id"], "merchant_id": world.merchant.id}


@respx.mock
def test_n8n_down_falls_back_to_inline(client, db, monkeypatch):
    monkeypatch.setattr(settings, "n8n_webhook_url", HOOK)
    monkeypatch.setattr(pipeline, "SessionLocal", lambda: db)
    respx.post(HOOK).mock(return_value=httpx.Response(502))
    world = make_world(db)
    v = _create(client, world)
    client.post(f"/api/visits/{v['id']}/analyze")
    after = client.get(f"/api/visits/{v['id']}").json()
    assert after["status"] == "completed"
    assert after["pipeline_mode"] == "inline_fallback"
    assert "n8n_unreachable" in [s["step"] for s in after["pipeline_log"]]
