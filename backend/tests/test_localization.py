import base64
from pathlib import Path

import httpx
import respx

from app.config import settings
from app.services import localization
from app.services.pipeline import run_inline
from tests.factories import make_visit, make_world, sharp_jpeg

API = "https://api.sarvam.ai"


@respx.mock
def test_non_compliant_guidance_is_translated_and_voiced(db, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(200, json={"translated_text": "नमस्ते रमेश जी, QR आगे रखिए।"}))
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"audios": [base64.b64encode(b"RIFFwav").decode()]}))
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(90)).id)
    iv = v.intervention
    assert iv.message_text == "नमस्ते रमेश जी, QR आगे रखिए।"
    assert iv.audio_url.endswith(".wav")
    assert (Path(settings.upload_dir) / iv.audio_path).read_bytes() == b"RIFFwav"
    assert v.notifications[0].audio_url == iv.audio_url
    assert any("sarvam" in s["summary"] for s in v.pipeline_log if s["step"] == "guidance")


@respx.mock
def test_sarvam_outage_falls_back_to_template(db, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(503))
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(503))
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(91)).id)
    assert v.status == "completed"
    assert v.intervention.message_text.startswith("नमस्ते Ramesh जी")
    assert v.intervention.audio_path is None


@respx.mock
def test_unexpected_storage_error_still_completes_visit(db, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(200, json={"translated_text": "नमस्ते रमेश जी"}))
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"audios": [base64.b64encode(b"RIFFwav").decode()]}))

    def disk_full(*_args, **_kwargs):
        raise OSError("No space left on device")

    monkeypatch.setattr(localization, "store_media", disk_full)
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(93)).id)
    assert v.status == "completed"
    assert v.intervention.message_text == "नमस्ते रमेश जी"
    assert v.intervention.audio_path is None
    assert any(s["summary"].startswith("sarvam:") for s in v.pipeline_log if s["step"] == "guidance")


def test_no_key_uses_template_without_network(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(92)).id)
    assert v.intervention.message_text.startswith("नमस्ते Ramesh जी")
    assert any(s["summary"].startswith("template:") for s in v.pipeline_log if s["step"] == "guidance")


@respx.mock
def test_null_translation_falls_back_to_template_and_completes_visit(db, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(200, json={"translated_text": None}))
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"audios": ["%%%"]}))
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(94)).id)
    assert v.status == "completed"
    assert v.intervention.message_text.startswith("नमस्ते Ramesh जी")
    assert v.intervention.audio_path is None
