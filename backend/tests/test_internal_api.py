from tests.factories import make_visit, make_world, sharp_jpeg

H = {"X-Internal-Token": "dev-internal-token"}


def test_requires_token(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(60))
    assert client.post(f"/api/internal/visits/{v.id}/fraud").status_code == 401
    assert client.post(f"/api/internal/visits/{v.id}/fraud", headers={"X-Internal-Token": "nope"}).status_code == 401


def test_n8n_style_step_sequence_non_compliant(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(61))
    base = f"/api/internal/visits/{v.id}"

    assert client.post(f"{base}/fraud", headers=H).json()["verdict"] == "VERIFIED"
    assert client.post(f"{base}/vision", headers=H).json()["qr_visibility_score"] == 38
    assert "merchant_name" in client.get(f"{base}/context", headers=H).json()
    decision = client.post(f"{base}/decide", headers=H).json()
    assert decision["outcome"] == "non_compliant"
    guidance = client.post(f"{base}/actions/guidance", headers=H).json()
    assert guidance["message_language"] == "hi-IN"
    assert client.post(f"{base}/actions/whatsapp", headers=H).json()["status"] == "dry_run"
    done = client.post(f"{base}/complete", headers=H).json()
    assert done == {"visit_id": v.id, "status": "completed", "decision": "non_compliant"}

    steps = [s["step"] for s in client.get(f"/api/visits/{v.id}").json()["pipeline_log"]]
    assert steps == ["fraud_check", "vision_ai", "merchant_context", "decision", "guidance", "whatsapp", "complete"]


def test_decide_before_vision_is_a_409(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(62))
    assert client.post(f"/api/internal/visits/{v.id}/decide", headers=H).status_code == 409
