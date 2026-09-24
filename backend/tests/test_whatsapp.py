import httpx
import respx

from app.config import settings
from app.services import actions
from app.services.pipeline import run_inline
from app.services.whatsapp import resolve_recipient, send_whatsapp_message
from tests.factories import make_visit, make_world, sharp_jpeg

URL = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json"


def _twilio(monkeypatch):
    for k, v in {"whatsapp_mode": "twilio", "twilio_account_sid": "AC1", "twilio_auth_token": "t"}.items():
        monkeypatch.setattr(settings, k, v)


@respx.mock
def test_twilio_send(monkeypatch):
    _twilio(monkeypatch)
    monkeypatch.setattr(settings, "public_base_url", "https://sightpay.example.com")
    route = respx.post(URL).mock(return_value=httpx.Response(201, json={"sid": "SM123"}))
    r = send_whatsapp_message("+919811111111", "नमस्ते", "https://sightpay.example.com/media/a.wav")
    assert (r.status, r.provider_ref) == ("sent", "SM123")
    body = route.calls[0].request.content.decode()
    assert "To=whatsapp%3A%2B919811111111" in body and "MediaUrl=" in body


@respx.mock
def test_localhost_media_is_not_attached(monkeypatch):
    _twilio(monkeypatch)
    route = respx.post(URL).mock(return_value=httpx.Response(201, json={"sid": "SM1"}))
    send_whatsapp_message("+91981", "hi", "http://localhost:8000/media/a.wav")
    assert "MediaUrl" not in route.calls[0].request.content.decode()


@respx.mock
def test_private_ip_media_is_not_attached(monkeypatch):
    _twilio(monkeypatch)
    route = respx.post(URL).mock(return_value=httpx.Response(201, json={"sid": "SM1"}))
    for host in ("172.20.1.5", "10.0.0.2", "192.168.1.9", "127.0.0.2", "[::1]"):
        send_whatsapp_message("+91981", "hi", f"http://{host}:8000/media/a.wav")
    assert all("MediaUrl" not in c.request.content.decode() for c in route.calls)


@respx.mock
def test_twilio_error_is_recorded_not_raised(monkeypatch):
    _twilio(monkeypatch)
    respx.post(URL).mock(return_value=httpx.Response(400, json={"message": "not in sandbox"}))
    r = send_whatsapp_message("+91981", "hi")
    assert r.status == "failed" and "sandbox" in r.error


@respx.mock
def test_non_json_success_body_is_recorded_not_raised(monkeypatch):
    _twilio(monkeypatch)
    respx.post(URL).mock(return_value=httpx.Response(201, text="<html>gateway</html>"))
    r = send_whatsapp_message("+91981", "hi")
    assert r.status == "failed" and r.error


@respx.mock
def test_network_error_is_recorded_not_raised(monkeypatch):
    _twilio(monkeypatch)
    respx.post(URL).mock(side_effect=httpx.ConnectError("boom"))
    r = send_whatsapp_message("+91981", "hi")
    assert r.status == "failed" and "boom" in r.error


@respx.mock
def test_twilio_without_token_falls_back_to_dry_run(monkeypatch):
    _twilio(monkeypatch)
    monkeypatch.setattr(settings, "twilio_auth_token", None)
    route = respx.post(URL)
    assert send_whatsapp_message("+91981", "hi").status == "dry_run"
    assert not route.called


def test_demo_redirect(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_demo_to", "+919999999999")
    assert resolve_recipient("+919811111111") == "+919999999999"


def test_dry_run_default():
    assert send_whatsapp_message("+91981", "hi").status == "dry_run"


def test_pipeline_records_demo_recipient(db, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_demo_to", "+919999999999")
    sent_to = []

    def spy(to_phone, body, media_url=None):
        sent_to.append(to_phone)
        return send_whatsapp_message(to_phone, body, media_url)

    monkeypatch.setattr(actions, "send_whatsapp_message", spy)
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(45)).id)
    n = v.notifications[0]
    assert (n.status, n.to_phone) == ("dry_run", "+919999999999")
    assert sent_to == ["+919999999999"] != [world.merchant.phone]
