from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./sightpay.db"
    upload_dir: str = "./storage/uploads"
    public_base_url: str = "http://localhost:8000"
    cors_origins: list[str] = ["*"]

    vision_provider: str = "fixture"  # "claude" | "fixture"
    vision_fixtures_path: str = "./fixtures/vision_fixtures.json"
    anthropic_model: str = "claude-opus-5"
    anthropic_api_key: str | None = None
    blur_threshold: float = 60.0
    dark_threshold: float = 40.0

    gps_radius_m: float = 100.0

    n8n_webhook_url: str | None = None
    internal_token: str = "dev-internal-token"

    whatsapp_mode: str = "dry_run"  # "dry_run" | "twilio" (P1)
    memory_backend: str = "sql"  # "sql" | "cognee" (P1)

    sarvam_api_key: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str = "+14155238886"  # Twilio sandbox number
    whatsapp_demo_to: str | None = None  # redirect all WhatsApp to this phone during demos
    cognee_timeout_s: float = 8.0


settings = Settings()
