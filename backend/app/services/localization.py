import logging
from dataclasses import dataclass

from app.services.guidance import Guidance
from app.services.photos import store_media
from app.services.sarvam import SarvamError, get_sarvam

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class LocalizedGuidance:
    text: str
    audio_path: str | None
    engine: str  # sarvam | sarvam_tts | template


def localize_guidance(g: Guidance, name_prefix: str) -> LocalizedGuidance:
    """English system diagnosis -> Sarvam translate -> Sarvam TTS. Falls back to curated templates.

    Never raises: a Sarvam (or media storage) failure must not fail the visit.
    """
    client = get_sarvam()
    if client is None:
        return LocalizedGuidance(g.text_local, None, "template")

    text, engine = g.text_local, "template"
    try:
        text = client.translate(g.text_en, "en-IN", g.language)
        engine = "sarvam"
    except SarvamError as exc:
        log.warning("Sarvam translate failed, using template: %s", exc)
    except Exception:
        log.exception("Unexpected error in Sarvam translate, using template")

    audio_path = None
    try:
        audio_path = store_media(client.tts(text, g.language), name_prefix, ".wav")
        engine = "sarvam" if engine == "sarvam" else "sarvam_tts"
    except SarvamError as exc:
        log.warning("Sarvam TTS failed, sending text only: %s", exc)
    except Exception:
        log.exception("Unexpected error in Sarvam TTS or storing the voice note, sending text only")
    return LocalizedGuidance(text, audio_path, engine)
