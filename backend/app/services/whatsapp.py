import ipaddress
import logging
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from app.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SendResult:
    status: str  # dry_run | sent | failed
    provider_ref: str | None = None
    error: str | None = None


def resolve_recipient(to_phone: str) -> str:
    return settings.whatsapp_demo_to or to_phone


def _is_public(url: str) -> bool:
    """Twilio fetches MediaUrl itself, so a local or private address would never arrive."""
    host = urlparse(url).hostname or ""
    if not host or host == "localhost" or host.endswith(".localhost"):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True  # a DNS name


def _send_twilio(to_phone: str, body: str, media_url: str | None) -> SendResult:
    sid = settings.twilio_account_sid
    data = {"From": f"whatsapp:{settings.twilio_whatsapp_from}", "To": f"whatsapp:{to_phone}", "Body": body}
    if media_url and _is_public(media_url):
        data["MediaUrl"] = media_url
    try:
        res = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data=data, auth=(sid, settings.twilio_auth_token), timeout=10.0,
        )
        if res.status_code >= 400:
            return SendResult("failed", error=res.text[:300])
        return SendResult("sent", provider_ref=res.json().get("sid"))
    except Exception as exc:  # a Twilio problem must never fail the visit
        return SendResult("failed", error=f"{type(exc).__name__}: {exc}"[:300])


def send_whatsapp_message(to_phone: str, body: str, media_url: str | None = None) -> SendResult:
    if settings.whatsapp_mode == "twilio":
        if settings.twilio_account_sid and settings.twilio_auth_token:
            result = _send_twilio(to_phone, body, media_url)
            if result.status == "failed":
                log.warning("WhatsApp (twilio) to %s failed: %s", to_phone, result.error)
            return result
        log.warning("WHATSAPP_MODE=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN missing; using dry_run")
    log.info("WhatsApp (dry_run) to %s: %s", to_phone, body)
    return SendResult(status="dry_run")
