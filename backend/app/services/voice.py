import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.labels import ACTION_LABELS
from app.services.memory import get_memory
from app.services.photos import store_media
from app.services.rep import USABLE_STATUSES, priority_queue
from app.services.sarvam import SarvamError, get_sarvam

log = logging.getLogger(__name__)

# Plain substring matching is enough for the demo phrasings; issue words are checked first so that
# "aaj is merchant ka problem kya hai?" is still a merchant question.
TODAY_WORDS = ("aaj", "today", "kaunse", "kaun se", "kis ", "आज", "कौन", "किस")
ISSUE_WORDS = ("problem", "issue", "samasya", "dikkat", "kya hua", "प्रॉब्लम", "समस्या", "दिक्कत", "परेशानी")


def classify_intent(transcript: str) -> str:
    t = transcript.lower()
    if any(w in t for w in ISSUE_WORDS):
        return "merchant_issue"
    if any(w in t for w in TODAY_WORDS):
        return "todays_visits"
    return "unknown"


@dataclass
class VoiceAnswer:
    transcript: str
    language: str
    intent: str
    answer_en: str
    answer_local: str
    audio_path: str | None
    merchant_id: int | None

    @property
    def audio_url(self) -> str | None:
        return f"{settings.public_base_url}/media/{self.audio_path}" if self.audio_path else None


def _merchant_issue(db: Session, merchant_id: int | None) -> str:
    if merchant_id is None:
        return "Open a merchant first, then ask about its problem."
    m = db.get(models.Merchant, merchant_id)
    if m is None:
        return "That merchant was not found. Open a merchant from your list and ask again."
    latest = db.scalars(
        select(models.Visit)
        .where(models.Visit.merchant_id == merchant_id, models.Visit.status.in_(USABLE_STATUSES), models.Visit.audit.has())
        .order_by(models.Visit.received_at.desc()).limit(1)
    ).first()
    if latest is None:
        return f"{m.name} has no audited visit yet."
    a, ctx = latest.audit, get_memory().get_context(db, merchant_id)
    parts = [f"{m.name}: QR visibility score {a.qr_visibility_score} out of 100."]
    if latest.decision == "compliant":
        parts.append("The counter is compliant.")
    else:
        parts.append(f"Main issue: {ACTION_LABELS.get(a.recommended_action, a.recommended_action)}.")
    if a.competitor and a.competitor_dominance in ("medium", "high"):
        parts.append(f"{a.competitor} QR is more prominent than Paytm.")
    if not a.soundbox_visible:
        parts.append("The Soundbox was not visible.")
    if ctx.consecutive_non_compliant > 1:
        parts.append(f"This has not been fixed for {ctx.consecutive_non_compliant} visits.")
    if ctx.transaction_trend_pct is not None:
        parts.append(f"Observed transaction change since the last fix: {ctx.transaction_trend_pct:+.1f} percent.")
    return " ".join(parts)


def _todays_visits(db: Session, fse_id: int, lat: float | None, lng: float | None) -> str:
    top = priority_queue(db, fse_id, lat, lng)[:3]
    if not top:
        return "All your merchants are covered today."
    # Full sentences with ordinal words translate cleanly; a terse "1. X, score 42. 2. Y" list made Sarvam
    # mistranslate the heading and merge "42. 2." into "42.3".
    ordinals = ("First", "Second", "Third")
    lines = [f"{o}, {r['name']}: {r['reasons'][0][:1].lower()}{r['reasons'][0][1:]}." for o, r in zip(ordinals, top)]
    return "Please visit these merchants today. " + " ".join(lines)


def answer_query(db: Session, fse_id: int, transcript: str, language: str = "en-IN",
                 merchant_id: int | None = None, lat: float | None = None, lng: float | None = None) -> VoiceAnswer:
    """Answer a rep's spoken question in English, then translate and voice it with Sarvam.

    Never raises because of Sarvam or media storage: it falls back to English text and no audio.
    """
    intent = classify_intent(transcript)
    if intent == "merchant_issue":
        answer_en = _merchant_issue(db, merchant_id)
    elif intent == "todays_visits":
        answer_en = _todays_visits(db, fse_id, lat, lng)
    else:
        answer_en = "I can tell you which merchants to visit today, or what a merchant's problem is."

    answer_local, audio_path = answer_en, None
    client = get_sarvam()
    if client is not None:
        try:
            answer_local = client.translate(answer_en, "en-IN", language)
        except SarvamError as exc:
            log.warning("voice translate failed, answering in English: %s", exc)
        except Exception:
            log.exception("Unexpected error in voice translate, answering in English")
        try:
            audio_path = store_media(client.tts(answer_local, language), "voice_answer", ".wav")
        except SarvamError as exc:
            log.warning("voice TTS failed, answering with text only: %s", exc)
        except Exception:
            log.exception("Unexpected error in voice TTS or storing the answer audio, answering with text only")
    return VoiceAnswer(transcript, language, intent, answer_en, answer_local, audio_path, merchant_id)
