import base64

import httpx
import pytest
import respx

from app.services.sarvam import SarvamClient, SarvamError

API = "https://api.sarvam.ai"


@respx.mock
def test_translate_sends_key_and_fields():
    route = respx.post(f"{API}/translate").mock(return_value=httpx.Response(200, json={"translated_text": "नमस्ते"}))
    out = SarvamClient("k").translate("Hello", "en-IN", "hi-IN")
    assert out == "नमस्ते"
    req = route.calls[0].request
    assert req.headers["api-subscription-key"] == "k"
    assert b'"target_language_code":"hi-IN"' in req.content.replace(b" ", b"")


def test_translate_same_language_is_a_noop():
    assert SarvamClient("k").translate("Hello", "en-IN", "en-IN") == "Hello"


@respx.mock
def test_tts_decodes_audio():
    route = respx.post(f"{API}/text-to-speech").mock(
        return_value=httpx.Response(200, json={"audios": [base64.b64encode(b"RIFFwav").decode()]}))
    assert SarvamClient("k").tts("नमस्ते", "hi-IN") == b"RIFFwav"
    assert b'"language_code":"hi-IN"' in route.calls[0].request.content.replace(b" ", b"")


@respx.mock
def test_stt_returns_transcript_and_language():
    route = respx.post(f"{API}/speech-to-text").mock(
        return_value=httpx.Response(200, json={"transcript": "आज कौन से मर्चेंट", "language_code": "hi-IN"}))
    t = SarvamClient("k").stt(b"RIFF", "q.wav")
    assert (t.text, t.language_code) == ("आज कौन से मर्चेंट", "hi-IN")
    assert b"saaras:v3" in route.calls[0].request.content


@respx.mock
def test_errors_become_sarvam_error():
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(429))
    with pytest.raises(SarvamError):
        SarvamClient("k").translate("Hi", "en-IN", "hi-IN")
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"unexpected": 1}))
    with pytest.raises(SarvamError):
        SarvamClient("k").tts("x", "hi-IN")
