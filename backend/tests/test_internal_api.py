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


def test_n8n_retries_of_non_compliant_actions_are_idempotent(client, db):
    world = make_world(db)
    v = make_visit(db, world, sharp_jpeg(63))
    base = f"/api/internal/visits/{v.id}"

    client.post(f"{base}/fraud", headers=H)
    client.post(f"{base}/vision", headers=H)
    decision = client.post(f"{base}/decide", headers=H).json()
    assert decision["outcome"] == "non_compliant"

    client.post(f"{base}/actions/guidance", headers=H)
    client.post(f"{base}/actions/whatsapp", headers=H)
    first_complete = client.post(f"{base}/complete", headers=H).json()
    first_get = client.get(f"/api/visits/{v.id}").json()

    # n8n retries every step (e.g. after a timeout on its side)
    client.post(f"{base}/actions/guidance", headers=H)
    client.post(f"{base}/actions/whatsapp", headers=H)
    second_complete = client.post(f"{base}/complete", headers=H).json()
    second_get = client.get(f"/api/visits/{v.id}").json()

    assert first_complete == second_complete == {"visit_id": v.id, "status": "completed", "decision": "non_compliant"}
    assert first_get["completed_at"] == second_get["completed_at"] is not None
    assert len(second_get["actions"]["notifications"]) == 1
    steps = [s["step"] for s in second_get["pipeline_log"]]
    assert steps == ["fraud_check", "vision_ai", "decision", "guidance", "whatsapp", "complete"]


def test_n8n_retries_of_fraud_block_and_complete_are_idempotent(client, db):
    world = make_world(db)
    photo = sharp_jpeg(64)
    make_visit(db, world, photo)  # establishes a prior photo_phash so the second visit is a duplicate
    v2 = make_visit(db, world, photo)
    base = f"/api/internal/visits/{v2.id}"

    assert client.post(f"{base}/fraud", headers=H).json()["verdict"] == "BLOCKED"
    client.post(f"{base}/vision", headers=H)
    decision = client.post(f"{base}/decide", headers=H).json()
    assert decision["outcome"] == "fraud"

    client.post(f"{base}/actions/block", headers=H)
    first_complete = client.post(f"{base}/complete", headers=H).json()
    first_get = client.get(f"/api/visits/{v2.id}").json()

    # n8n retries the block and complete steps
    client.post(f"{base}/actions/block", headers=H)
    second_complete = client.post(f"{base}/complete", headers=H).json()
    second_get = client.get(f"/api/visits/{v2.id}").json()

    assert first_complete == second_complete == {"visit_id": v2.id, "status": "blocked", "decision": "fraud"}
    assert first_get["completed_at"] == second_get["completed_at"] is not None
    steps = [s["step"] for s in second_get["pipeline_log"]]
    assert steps == ["fraud_check", "vision_ai", "decision", "block", "complete"]
