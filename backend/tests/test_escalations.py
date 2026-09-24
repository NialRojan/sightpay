from app.services.pipeline import run_inline
from tests.factories import blurry_jpeg, make_visit, make_world, sharp_jpeg


def test_list_and_reject(client, db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, blurry_jpeg()).id)
    rows = client.get("/api/escalations?status=open").json()
    assert rows[0]["visit_id"] == v.id and rows[0]["merchant_name"] == "Ramesh General Store"
    esc_id = rows[0]["id"]
    res = client.post(f"/api/escalations/{esc_id}/reject", json={"resolved_by": "Priya Kulkarni", "note": "Retake"})
    assert res.json()["status"] == "rejected"
    assert client.get(f"/api/visits/{v.id}").json()["status"] == "rejected"
    assert client.post(f"/api/escalations/{esc_id}/approve", json={"resolved_by": "Priya"}).status_code == 409


def test_approve_review_required_visit_applies_the_real_decision(client, db):
    world = make_world(db)
    # far from shop + unknown source -> REVIEW_REQUIRED -> low_confidence; photo itself is non-compliant
    v = run_inline(db, make_visit(db, world, sharp_jpeg(80), lat=world.merchant.lat + 0.02, capture_source="unknown").id)
    esc_id = client.get("/api/escalations").json()[0]["id"]
    client.post(f"/api/escalations/{esc_id}/approve", json={"resolved_by": "Priya Kulkarni"})
    after = client.get(f"/api/visits/{v.id}").json()
    assert after["status"] == "completed" and after["decision"] == "non_compliant"
    assert after["decision_reasons"][0].startswith("Manager approved")
    assert after["actions"]["notifications"][0]["status"] == "dry_run"


def test_approve_unusable_photo_takes_no_automated_action(client, db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, blurry_jpeg()).id)
    esc_id = client.get("/api/escalations").json()[0]["id"]
    client.post(f"/api/escalations/{esc_id}/approve", json={"resolved_by": "Priya"})
    after = client.get(f"/api/visits/{v.id}").json()
    assert after["status"] == "completed" and after["decision"] == "low_confidence"
    assert after["actions"]["notifications"] == [] and after["actions"]["incentive"] is None
