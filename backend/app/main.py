import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="SightPay API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "vision_provider": settings.vision_provider,
            "anthropic_key": bool(settings.anthropic_api_key),
            "n8n": bool(settings.n8n_webhook_url),
            "memory": settings.memory_backend,
            "whatsapp": settings.whatsapp_mode,
            "sarvam": bool(settings.sarvam_api_key),
            "twilio": bool(settings.twilio_account_sid and settings.twilio_auth_token),
        }

    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/media", StaticFiles(directory=settings.upload_dir, check_dir=False), name="media")

    from app import models  # noqa: F401
    from app.db import Base, engine

    Base.metadata.create_all(bind=engine)

    from app.api import analytics, audit, escalations, fraud, fse, incentives, internal, merchants, transactions, visits, voice, webhooks

    for r in (audit, visits, internal, merchants, escalations, analytics, fraud, incentives, transactions, fse, voice, webhooks):
        app.include_router(r.router, prefix="/api")

    return app


app = create_app()
