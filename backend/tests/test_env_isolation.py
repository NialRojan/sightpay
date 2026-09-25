from app.config import Settings, settings


def test_tests_ignore_the_developer_env_file():
    # A developer's backend/.env holds live keys (Sarvam, Twilio, demo phone). Tests must never see them,
    # or they make real network calls and the localized-guidance / WhatsApp assertions change.
    assert settings.sarvam_api_key is None
    assert settings.anthropic_api_key is None
    assert settings.twilio_account_sid is None
    assert settings.whatsapp_demo_to is None
    assert settings.gps_radius_m == 100.0
    assert settings.public_base_url == "http://localhost:8000"


def test_env_file_can_still_be_pointed_at_explicitly(tmp_path, monkeypatch):
    env = tmp_path / "custom.env"
    env.write_text("SARVAM_API_KEY=from-file\n")
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    assert Settings(_env_file=str(env)).sarvam_api_key == "from-file"
