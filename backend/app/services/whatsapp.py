import logging
from dataclasses import dataclass

from app.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SendResult:
    status: str  # dry_run | sent | failed
    provider_ref: str | None = None
    error: str | None = None


def send_whatsapp_message(to_phone: str, body: str, media_url: str | None = None) -> SendResult:
    log.info("WhatsApp (%s) to %s: %s", settings.whatsapp_mode, to_phone, body)
    return SendResult(status="dry_run")
