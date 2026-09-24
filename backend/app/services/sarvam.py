import base64
from dataclasses import dataclass

import httpx

from app.config import settings

# Endpoints, field names, models and speaker checked against the sarvamai SDK 0.1.34 API definition.
BASE_URL = "https://api.sarvam.ai"
TRANSLATE_MODEL = "mayura:v1"  # input limit: 1000 characters
TTS_MODEL = "bulbul:v2"
TTS_SPEAKER = "anushka"
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
        self._http = httpx.Client(base_url=base_url, headers={"api-subscription-key": api_key}, timeout=timeout)

    def _post(self, path: str, **kwargs) -> dict:
        try:
            res = self._http.post(path, **kwargs)
            res.raise_for_status()
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
        return self._field(data, "/translate", "translated_text")

    def tts(self, text: str, language: str) -> bytes:
        data = self._post("/text-to-speech", json={
            "text": text, "language_code": language, "speaker": TTS_SPEAKER, "model": TTS_MODEL,
        })
        return base64.b64decode(self._field(data, "/text-to-speech", "audios", 0))

    def stt(self, audio: bytes, filename: str, content_type: str = "audio/wav") -> Transcript:
        data = self._post(
            "/speech-to-text",
            files={"file": (filename, audio, content_type)},
            data={"model": STT_MODEL, "mode": STT_MODE, "language_code": "unknown"},
        )
        return Transcript(self._field(data, "/speech-to-text", "transcript"), data.get("language_code") or "hi-IN")


def get_sarvam() -> SarvamClient | None:
    return SarvamClient(settings.sarvam_api_key) if settings.sarvam_api_key else None
