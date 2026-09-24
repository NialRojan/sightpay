import base64
from datetime import date

import httpx
import respx
from sqlalchemy import select

from app import models
from app.config import settings
from app.seed import seed
from app.services.voice import answer_query, classify_intent

API = "https://api.sarvam.ai"


def test_classify_intent_hinglish_and_devanagari():
    assert classify_intent("Aaj mujhe kaunse merchants visit karne hain?") == "todays_visits"
    assert classify_intent("आज मुझे कौन से मर्चेंट्स विज़िट करने हैं?") == "todays_visits"
    assert classify_intent("Is merchant ka problem kya hai?") == "merchant_issue"
    assert classify_intent("इस मर्चेंट की समस्या क्या है?") == "merchant_issue"
    assert classify_intent("weather kaisa hai") == "unknown"


def test_issue_question_mentioning_today_is_merchant_issue():
    assert classify_intent("Aaj is merchant ka problem kya hai?") == "merchant_issue"
    assert classify_intent("आज इस मर्चेंट की समस्या क्या है?") == "merchant_issue"


def _ids(db):
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    return ramesh.id, ramesh.assigned_fse_id


def test_merchant_issue_answer_uses_memory(db):
    seed(db, today=date(2026, 9, 25))
    mid, fid = _ids(db)
    a = answer_query(db, fid, "Is merchant ka problem kya hai?", merchant_id=mid)
    assert a.intent == "merchant_issue"
    assert "42" in a.answer_en and "QR obstruction" in a.answer_en
    assert a.answer_local == a.answer_en  # no Sarvam key -> English


def test_merchant_issue_unknown_merchant_is_polite(db):
    seed(db, today=date(2026, 9, 25))
    _, fid = _ids(db)
    a = answer_query(db, fid, "Is merchant ka problem kya hai?", merchant_id=999999)
    assert a.intent == "merchant_issue" and "not found" in a.answer_en


def test_todays_visits_lists_top_three(db):
    seed(db, today=date(2026, 9, 25))
    _, fid = _ids(db)
    a = answer_query(db, fid, "Aaj mujhe kaunse merchants visit karne hain?")
    assert a.answer_en.startswith("Please visit these merchants today.") and a.answer_en.count(". ") >= 3
    assert "First, " in a.answer_en and "Third, " in a.answer_en


@respx.mock
def test_answer_survives_unexpected_sarvam_errors(db, monkeypatch):
    seed(db, today=date(2026, 9, 25))
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(200, json={"translated_text": "नमस्ते"}))
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"audios": ["RIFF"]}))

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr("app.services.voice.store_media", boom)
    _, fid = _ids(db)
    a = answer_query(db, fid, "Aaj mujhe kaunse merchants visit karne hain?", language="hi-IN")
    assert a.answer_local == "नमस्ते" and a.audio_path is None


@respx.mock
def test_voice_endpoint_full_sarvam_loop(client, db, monkeypatch):
    seed(db, today=date(2026, 9, 25))
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/speech-to-text").mock(return_value=httpx.Response(200, json={"transcript": "आज मुझे कौन से मर्चेंट्स विज़िट करने हैं?", "language_code": "hi-IN"}))
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(200, json={"translated_text": "आज इन दुकानों पर जाइए"}))
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"audios": [base64.b64encode(b"RIFF").decode()]}))
    _, fid = _ids(db)
    res = client.post("/api/voice/query", data={"fse_id": fid}, files={"audio": ("q.wav", b"RIFF", "audio/wav")}).json()
    assert res["intent"] == "todays_visits" and res["language"] == "hi-IN"
    assert res["answer_local"] == "आज इन दुकानों पर जाइए"
    assert res["audio_url"].endswith(".wav")


def test_voice_endpoint_requires_text_or_audio(client, db):
    assert client.post("/api/voice/query", data={"fse_id": 1}).status_code == 422


def test_voice_endpoint_unknown_fse_is_404(client, db):
    assert client.post("/api/voice/query", data={"fse_id": 999999, "text": "aaj"}).status_code == 404


def test_voice_endpoint_rejects_oversized_audio(client, db, monkeypatch):
    seed(db, today=date(2026, 9, 25))
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    monkeypatch.setattr("app.api.voice.MAX_AUDIO_BYTES", 10)
    _, fid = _ids(db)
    res = client.post("/api/voice/query", data={"fse_id": fid}, files={"audio": ("q.wav", b"x" * 11, "audio/wav")})
    assert res.status_code == 413


def test_todays_visits_keeps_reason_casing_after_first_letter(db):
    seed(db, today=date(2026, 9, 25))
    _, fid = _ids(db)
    a = answer_query(db, fid, "Aaj mujhe kaunse merchants visit karne hain?")
    assert "Om Sweets: last QR score 33" in a.answer_en and "qr score" not in a.answer_en


def test_voice_endpoint_rejects_whitespace_only_text(client, db):
    seed(db, today=date(2026, 9, 25))
    _, fid = _ids(db)
    assert client.post("/api/voice/query", data={"fse_id": fid, "text": "   "}).status_code == 422


def test_tts_rejects_empty_and_whitespace_text(client, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    for text in ("", "   "):
        assert client.post("/api/voice/tts", json={"text": text}).status_code == 422


@respx.mock
def test_tts_storage_error_is_502(client, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "k")
    respx.post(f"{API}/text-to-speech").mock(
        return_value=httpx.Response(200, json={"audios": [base64.b64encode(b"RIFF").decode()]}))

    def disk_full(*a, **k):
        raise OSError("No space left on device")

    monkeypatch.setattr("app.api.voice.store_media", disk_full)
    assert client.post("/api/voice/tts", json={"text": "नमस्ते"}).status_code == 502
