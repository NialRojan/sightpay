import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db
from app.services.steps import append_step
from app.services.whatsapp import twilio_signature

router = APIRouter(prefix="/webhooks", tags=["webhooks (Twilio)"])

# Callbacks can arrive out of order; a status only ever moves up this ranking. delivered and
# failed/undelivered are alternative outcomes, so the first one to arrive wins; read beats all (it proves delivery).
_RANK = {"dry_run": 0, "sent": 1, "delivered": 2, "undelivered": 2, "failed": 2, "read": 3}
_TRACKED = {"delivered", "read", "failed", "undelivered"}  # queued/sending/sent are ignored


def _public_url(request: Request) -> str:
    # Behind ngrok request.url is http://localhost..., but Twilio signed the public URL it called.
    url = settings.public_base_url.rstrip("/") + request.url.path
    return f"{url}?{request.url.query}" if request.url.query else url


@router.post("/twilio/status", status_code=204)
async def twilio_status(request: Request, db: Session = Depends(get_db)) -> Response:
    token = settings.twilio_auth_token
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    given = request.headers.get("X-Twilio-Signature")
    if not token or not given:
        raise HTTPException(403, "Invalid Twilio signature")
    expected = twilio_signature(token, _public_url(request), params)
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(403, "Invalid Twilio signature")

    sid, status = params.get("MessageSid"), params.get("MessageStatus")
    n = db.query(models.Notification).filter_by(provider_ref=sid).first() if sid else None
    if n is None or status not in _TRACKED or _RANK[status] <= _RANK.get(n.status, 0):
        return Response(status_code=204)  # unknown sid / progress status / stale callback: no-op (2xx stops retries)

    n.status = status
    label = f"WhatsApp {status}"
    if status in ("failed", "undelivered"):
        code = params.get("ErrorCode", "")
        n.error = f"Twilio {code}: {params.get('ErrorMessage') or ''}".strip()
        if code:
            label += f" (Twilio {code})"
    if n.visit_id is not None and (visit := db.get(models.Visit, n.visit_id)) is not None:
        append_step(visit, "whatsapp_status", label)
    db.commit()
    return Response(status_code=204)
