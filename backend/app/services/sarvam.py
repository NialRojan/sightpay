import base64
import binascii
from dataclasses import dataclass

import httpx

from app.config import settings

# Endpoints, field names, models and speaker checked against the sarvamai SDK 0.1.34 API definition.
# bulbul:v2 is deprecated live ("use bulbul:v3"); v3 has its own speakers (anushka is v2-only).
BASE_URL = "https://api.sarvam.ai"
TRANSLATE_MODEL = "mayura:v1"  # input limit: 1000 characters
TTS_MODEL = "bulbul:v3"
TTS_SPEAKER = "priya"
# WhatsApp voice notes accept mp3/ogg/aac/amr but not WAV, and browsers play mp3, so ask Sarvam for mp3.
TTS_CODEC = "mp3"
AUDIO_EXT = ".mp3"
STT_MODEL = "saaras:v3"
STT_MODE = "transcribe"


class SarvamError(Exception):
    pass


@dataclass(frozen=True)
class Transcript:
    text: str
    language_code: str


class SarvamClient:
    def __init__(self, api_key: str, base_url: str = BASE_URL, timeout: float = 20.0):
        # One short-lived connection per call (httpx.post closes it), so a client never leaks sockets.
        self._base_url, self._timeout = base_url.rstrip("/"), timeout
        self._headers = {"api-subscription-key": api_key}

    def _post(self, path: str, **kwargs) -> dict:
        try:
            res = httpx.post(f"{self._base_url}{path}", headers=self._headers, timeout=self._timeout, **kwargs)
            if res.status_code >= 400:
                # Sarvam explains 4xx errors (bad field, speaker/model mismatch) in the body.
                raise SarvamError(f"{path}: HTTP {res.status_code}: {res.text[:300]}")
            return res.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise SarvamError(f"{path}: {exc}") from exc

    @staticmethod
    def _field(data: dict, path: str, *keys):
        try:
            for k in keys:
                data = data[k]
            return data
        except (KeyError, IndexError, TypeError) as exc:
            raise SarvamError(f"{path}: unexpected response {str(data)[:200]}") from exc

    def translate(self, text: str, source: str, target: str) -> str:
        if source == target:
            return text
        data = self._post("/translate", json={
            "input": text, "source_language_code": source, "target_language_code": target, "model": TRANSLATE_MODEL,
        })
        out = self._field(data, "/translate", "translated_text")
        if not isinstance(out, str) or not out.strip():
            raise SarvamError(f"/translate: empty or non-text translation {str(out)[:200]}")
        return out

    def tts(self, text: str, language: str) -> bytes:
        data = self._post("/text-to-speech", json={
            "text": text, "language_code": language, "speaker": TTS_SPEAKER, "model": TTS_MODEL,
            "output_audio_codec": TTS_CODEC,
        })
        audio = self._field(data, "/text-to-speech", "audios", 0)
        try:
            return base64.b64decode(audio, validate=True)
        except (binascii.Error, TypeError, ValueError) as exc:
            raise SarvamError(f"/text-to-speech: audio is not valid base64: {exc}") from exc

    def stt(self, audio: bytes, filename: str, content_type: str = "audio/wav") -> Transcript:
        data = self._post(
            "/speech-to-text",
            files={"file": (filename, audio, content_type)},
            data={"model": STT_MODEL, "mode": STT_MODE, "language_code": "unknown"},
        )
        text = self._field(data, "/speech-to-text", "transcript")
        if not isinstance(text, str):
            raise SarvamError(f"/speech-to-text: non-text transcript {str(text)[:200]}")
        return Transcript(text, data.get("language_code") or "hi-IN")


def get_sarvam() -> SarvamClient | None:
    return SarvamClient(settings.sarvam_api_key) if settings.sarvam_api_key else None
