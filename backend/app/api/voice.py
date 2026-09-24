from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, StringConstraints
from sqlalchemy.orm import Session

from app.api.fse import _fse
from app.config import settings
from app.db import get_db
from app.services.photos import store_media
from app.services.sarvam import SarvamError, get_sarvam
from app.services.voice import answer_query

router = APIRouter(prefix="/voice", tags=["voice (Sarvam)"])

MAX_AUDIO_BYTES = 10 * 1024 * 1024


@router.post("/query")
def voice_query(
    fse_id: int = Form(...),
    merchant_id: int | None = Form(None),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    text: str | None = Form(None),
    language: str = Form("hi-IN"),
    audio: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    if audio is None and not (text and text.strip()):
        raise HTTPException(422, "Send either an audio file or text")
    _fse(db, fse_id)
    if audio is not None:
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio larger than 10 MB")
        client = get_sarvam()
        if client is None:
            raise HTTPException(503, "Speech-to-text needs SARVAM_API_KEY")
        try:
            t = client.stt(data, audio.filename or "query.wav", audio.content_type or "audio/wav")
        except SarvamError as exc:
            raise HTTPException(502, f"Sarvam STT failed: {exc}")
        text, language = t.text, t.language_code
    a = answer_query(db, fse_id, text, language, merchant_id, lat, lng)
    return {"transcript": a.transcript, "language": a.language, "intent": a.intent, "answer_en": a.answer_en,
            "answer_local": a.answer_local, "audio_url": a.audio_url, "merchant_id": a.merchant_id}


class TtsIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]  # empty/whitespace-only -> 422
    language: str = "hi-IN"


@router.post("/tts")
def tts(body: TtsIn):
    client = get_sarvam()
    if client is None:
        raise HTTPException(503, "TTS needs SARVAM_API_KEY")
    try:
        path = store_media(client.tts(body.text, body.language), "tts", ".wav")
    except SarvamError as exc:
        raise HTTPException(502, str(exc))
    except OSError as exc:
        raise HTTPException(502, f"Could not store the audio: {exc}")
    return {"audio_url": f"{settings.public_base_url}/media/{path}"}
