import httpx
import respx

from app import models
from app.config import settings
from app.services.whatsapp import send_whatsapp_message, twilio_signature
from tests.factories import make_visit, make_world, sharp_jpeg

BASE = "https://abc123.ngrok.app"
PATH = "/api/webhooks/twilio/status"
TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json"


def _twilio(monkeypatch, base=BASE):
    for k, v in {"whatsapp_mode": "twilio", "twilio_account_sid": "AC1", "twilio_auth_token": "tok",
                 "public_base_url": base}.items():
        monkeypatch.setattr(settings, k, v)


def _notification(db, sid="SM1", status="sent"):
    world = make_world(db)
    visit = make_visit(db, world, sharp_jpeg(60))
    n = models.Notification(merchant_id=world.merchant.id, visit_id=visit.id, channel="whatsapp",
                            to_phone="+91981", body="hi", status=status, provider_ref=sid)
    db.add(n)
    db.commit()
    return n, visit


def _post(client, params, token="tok", signature=None):
    sig = signature if signature is not None else twilio_signature(token, BASE + PATH, params)
    return client.post(PATH, data=params, headers={"X-Twilio-Signature": sig} if sig else {})


def test_signature_matches_twilio_docs_example():
    # The worked example from Twilio's "Webhooks security" docs.
    params = {"CallSid": "CA1234567890ABCDE", "Caller": "+12349013030", "Digits": "1234",
              "From": "+12349013030", "To": "+18005551212"}
    assert twilio_signature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params) == "0/KCTR6DLpKmkAf8muzZqo1nDgQ="


def test_signature_sorts_keys_and_depends_on_url_and_token():
    a = twilio_signature("tok", BASE + PATH, {"b": "2", "a": "1"})
    assert a == twilio_signature("tok", BASE + PATH, {"a": "1", "b": "2"})
    assert a != twilio_signature("tok2", BASE + PATH, {"a": "1", "b": "2"})
    assert a != twilio_signature("tok", "http://localhost:8000" + PATH, {"a": "1", "b": "2"})


def test_undelivered_updates_status_error_and_log(client, db, monkeypatch):
    _twilio(monkeypatch)
    n, visit = _notification(db)
    r = _post(client, {"MessageSid": "SM1", "MessageStatus": "undelivered", "ErrorCode": "63015",
                       "ErrorMessage": "Recipient has not joined the sandbox", "AccountSid": "AC1"})
    assert r.status_code == 204 and r.content == b""
    db.refresh(n)
    assert n.status == "undelivered"
    assert n.error == "Twilio 63015: Recipient has not joined the sandbox"
    db.refresh(visit)
    last = visit.pipeline_log[-1]
    assert (last["step"], last["summary"]) == ("whatsapp_status", "WhatsApp undelivered (Twilio 63015)")


def test_failed_without_error_message(client, db, monkeypatch):
    _twilio(monkeypatch)
    n, _ = _notification(db)
    assert _post(client, {"MessageSid": "SM1", "MessageStatus": "failed", "ErrorCode": "63016"}).status_code == 204
    db.refresh(n)
    assert (n.status, n.error) == ("failed", "Twilio 63016:")


def test_out_of_order_read_then_delivered_keeps_read(client, db, monkeypatch):
    _twilio(monkeypatch)
    n, visit = _notification(db)
    _post(client, {"MessageSid": "SM1", "MessageStatus": "read"})
    _post(client, {"MessageSid": "SM1", "MessageStatus": "delivered"})
    _post(client, {"MessageSid": "SM1", "MessageStatus": "sent"})
    db.refresh(n)
    db.refresh(visit)
    assert n.status == "read"
    assert [s["summary"] for s in visit.pipeline_log if s["step"] == "whatsapp_status"] == ["WhatsApp read"]


def test_progress_statuses_are_ignored(client, db, monkeypatch):
    _twilio(monkeypatch)
    n, visit = _notification(db)
    for st in ("queued", "sending", "sent"):
        assert _post(client, {"MessageSid": "SM1", "MessageStatus": st}).status_code == 204
    db.refresh(n)
    db.refresh(visit)
    assert n.status == "sent"
    assert not any(s["step"] == "whatsapp_status" for s in visit.pipeline_log or [])


def test_unknown_sid_is_a_noop(client, db, monkeypatch):
    _twilio(monkeypatch)
    n, _ = _notification(db)
    r = _post(client, {"MessageSid": "SMunknown", "MessageStatus": "delivered"})
    assert r.status_code == 204
    db.refresh(n)
    assert n.status == "sent"


def test_missing_or_bad_signature_is_rejected(client, db, monkeypatch):
    _twilio(monkeypatch)
    n, _ = _notification(db)
    params = {"MessageSid": "SM1", "MessageStatus": "delivered"}
    assert _post(client, params, signature="").status_code == 403
    assert _post(client, params, signature="bm90LWEtc2lnbmF0dXJl").status_code == 403
    assert _post(client, params, token="wrong").status_code == 403
    # Signed over the local URL instead of the public one Twilio called.
    local = twilio_signature("tok", "http://testserver" + PATH, params)
    assert _post(client, params, signature=local).status_code == 403
    db.refresh(n)
    assert n.status == "sent"


def test_rejected_when_twilio_not_configured(client, db, monkeypatch):
    _twilio(monkeypatch)
    monkeypatch.setattr(settings, "twilio_auth_token", None)
    _notification(db)
    params = {"MessageSid": "SM1", "MessageStatus": "delivered"}
    assert _post(client, params).status_code == 403


@respx.mock
def test_status_callback_sent_only_for_public_base_url(monkeypatch):
    route = respx.post(TWILIO_URL).mock(return_value=httpx.Response(201, json={"sid": "SM9"}))
    _twilio(monkeypatch)
    send_whatsapp_message("+91981", "hi")
    assert "StatusCallback=https%3A%2F%2Fabc123.ngrok.app%2Fapi%2Fwebhooks%2Ftwilio%2Fstatus" in route.calls[0].request.content.decode()
    for base in ("http://localhost:8000", "http://192.168.1.20:8000", "http://127.0.0.1:8000"):
        _twilio(monkeypatch, base)
        send_whatsapp_message("+91981", "hi")
    assert all("StatusCallback" not in c.request.content.decode() for c in route.calls[1:])
