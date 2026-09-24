def test_health_reports_modes(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["vision_provider"] == "fixture"
    assert body["n8n"] is False


def test_health_reports_anthropic_key_presence(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "anthropic_api_key", None)
    assert client.get("/api/health").json()["anthropic_key"] is False
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-x")
    assert client.get("/api/health").json()["anthropic_key"] is True
