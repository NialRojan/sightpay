def test_health_reports_modes(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["vision_provider"] == "fixture"
    assert body["n8n"] is False
