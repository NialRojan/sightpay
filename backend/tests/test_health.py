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


def test_health_reports_sarvam_and_twilio_presence(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "sarvam_api_key", None)
    monkeypatch.setattr(settings, "twilio_account_sid", None)
    monkeypatch.setattr(settings, "twilio_auth_token", None)
    body = client.get("/api/health").json()
    assert body["sarvam"] is False
    assert body["twilio"] is False

    monkeypatch.setattr(settings, "sarvam_api_key", "sk-sarvam")
    monkeypatch.setattr(settings, "twilio_account_sid", "AC123")
    body = client.get("/api/health").json()
    assert body["sarvam"] is True
    assert body["twilio"] is False  # both Twilio credentials are needed

    monkeypatch.setattr(settings, "twilio_auth_token", "tok")
    assert client.get("/api/health").json()["twilio"] is True
