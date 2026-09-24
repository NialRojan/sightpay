# SightPay Backend P1 — Sarvam, WhatsApp, Cognee Memory, Rep Intelligence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the P0 stand-ins with the real sponsor integrations while keeping every offline fallback:
- Sarvam translates the English diagnosis and speaks it in Hindi or Marathi.
- Real WhatsApp delivery.
- Cognee long-term merchant memory feeds the decision context.
- Add rep intelligence: priority queue, next-best merchant, coverage, performance, visit map, and a voice assistant ("Aaj mujhe kaunse merchants visit karne hain?").

**Architecture:** Each integration is a thin client module behind a factory that returns `None` or a fallback when it isn't configured. P0 call sites change only at single, named seams: `actions.create_guidance`, `whatsapp.send_whatsapp_message` and `memory.get_memory`. Rep intelligence is a pure service over existing tables. The voice assistant composes STT → intent → data answer → translate → TTS.

**Tech Stack:** P0 stack plus Sarvam REST API (httpx), Twilio WhatsApp API (httpx), `cognee` (optional extra), respx for HTTP mocks.

**Spec:** `docs/spec-person-b.md` sections 4 (n8n Sarvam → WhatsApp branch), 5 (Sarvam), 6 (Cognee), and Phase 4 (Rep Intelligence). **Prerequisite:** P0 plan complete (`docs/superpowers/plans/2026-09-25-sightpay-p0-core-loop.md`).

## Global Constraints

- All P0 Global Constraints still apply (the `/api` prefix, naive UTC, idempotent actions, and an offline fallback for every integration).
- With no `SARVAM_API_KEY`, guidance falls back to the P0 Hindi/Marathi templates and has no audio. With no Twilio credentials, WhatsApp stays `dry_run`. With `MEMORY_BACKEND=sql`, or when Cognee fails or times out, context comes from SQL.
- The demo must never text real merchants. When `WHATSAPP_DEMO_TO` is set, every WhatsApp goes to that team phone instead of the merchant.
- A Sarvam, Twilio or Cognee failure must never fail a visit. The visit still completes, and `pipeline_log` records which engine was used.
- Keep Sarvam model/speaker/endpoint names as constants at the top of `app/services/sarvam.py`. Verify them against https://docs.sarvam.ai before relying on them.

## File Structure

```
backend/app/config.py                 # + sarvam/twilio/cognee settings
backend/app/services/sarvam.py        # SarvamClient: translate, tts, stt
backend/app/services/localization.py  # localize_guidance: Sarvam translate+TTS with template fallback
backend/app/services/photos.py        # + store_media
backend/app/services/actions.py       # create_guidance uses localize_guidance
backend/app/services/whatsapp.py      # + Twilio sending, demo redirect
backend/app/services/rep.py           # priority_queue, coverage, performance, fse_summary
backend/app/services/voice.py         # classify_intent, answer_query
backend/app/services/memory/cognee_memory.py  # CogneeAdapter, CogneeMemory
backend/app/services/memory/__init__.py       # get_memory picks backend
backend/app/memory_backfill.py        # push seeded history into Cognee
backend/app/api/fse.py                # /fse, /fse/{id}/queue|summary|visits
backend/app/api/voice.py              # /voice/query, /voice/tts
backend/tests/test_sarvam.py test_localization.py test_whatsapp.py test_rep.py test_voice.py test_cognee_memory.py
```

---

### Task 1: Sarvam client (translate, text-to-speech, speech-to-text)

**Files:**
- Create: `backend/app/services/sarvam.py`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_sarvam.py`

**Interfaces:**
- Produces: `SarvamError(Exception)`, `Transcript(text: str, language_code: str)`, `SarvamClient(api_key, base_url=BASE_URL, timeout=20.0)` with `.translate(text, source, target) -> str`, `.tts(text, language) -> bytes` (WAV), `.stt(audio: bytes, filename: str, content_type="audio/wav") -> Transcript`, and `get_sarvam() -> SarvamClient | None`.

- [ ] **Step 1: Verify the live API shape (5 min)**

Open https://docs.sarvam.ai (API reference). For each call, confirm the path, JSON field names, model names and response field. Write any difference into the constants and field names in Step 4 before coding.

| Call | Path | Request | Response |
|---|---|---|---|
| Translate | `POST /translate` | `{"input","source_language_code","target_language_code","model":"mayura:v1"}` | `translated_text` |
| TTS | `POST /text-to-speech` | `{"text","target_language_code","speaker":"anushka","model":"bulbul:v2"}` | `audios[0]` (base64 WAV) |
| STT | `POST /speech-to-text` (multipart) | `file`, `model="saarika:v2.5"`, `language_code="unknown"` | `transcript`, `language_code` |

Auth header: `api-subscription-key: <key>`. Quick check:
```bash
curl -s https://api.sarvam.ai/translate -H "api-subscription-key: $SARVAM_API_KEY" -H 'content-type: application/json' \
  -d '{"input":"Please place the Paytm QR next to the billing counter.","source_language_code":"en-IN","target_language_code":"hi-IN","model":"mayura:v1"}'
```
Expected: JSON with `translated_text` in Devanagari.

- [ ] **Step 2: Add settings in `backend/app/config.py`**

```python
    sarvam_api_key: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str = "+14155238886"  # Twilio sandbox number
    whatsapp_demo_to: str | None = None  # redirect all WhatsApp to this phone during demos
    cognee_timeout_s: float = 8.0
```
Add the same keys, empty, to `.env.example`.

- [ ] **Step 3: Write the failing test `backend/tests/test_sarvam.py`**

```python
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
    respx.post(f"{API}/text-to-speech").mock(
        return_value=httpx.Response(200, json={"audios": [base64.b64encode(b"RIFFwav").decode()]}))
    assert SarvamClient("k").tts("नमस्ते", "hi-IN") == b"RIFFwav"


@respx.mock
def test_stt_returns_transcript_and_language():
    respx.post(f"{API}/speech-to-text").mock(
        return_value=httpx.Response(200, json={"transcript": "आज कौन से मर्चेंट", "language_code": "hi-IN"}))
    t = SarvamClient("k").stt(b"RIFF", "q.wav")
    assert (t.text, t.language_code) == ("आज कौन से मर्चेंट", "hi-IN")


@respx.mock
def test_errors_become_sarvam_error():
    respx.post(f"{API}/translate").mock(return_value=httpx.Response(429))
    with pytest.raises(SarvamError):
        SarvamClient("k").translate("Hi", "en-IN", "hi-IN")
    respx.post(f"{API}/text-to-speech").mock(return_value=httpx.Response(200, json={"unexpected": 1}))
    with pytest.raises(SarvamError):
        SarvamClient("k").tts("x", "hi-IN")
```

- [ ] **Step 4: Run the test to verify it fails, then implement `backend/app/services/sarvam.py`**

Run: `pytest tests/test_sarvam.py -v` → Expected: FAIL (`ModuleNotFoundError`)

```python
import base64
from dataclasses import dataclass

import httpx

from app.config import settings

BASE_URL = "https://api.sarvam.ai"
TRANSLATE_MODEL = "mayura:v1"
TTS_MODEL = "bulbul:v2"
TTS_SPEAKER = "anushka"
STT_MODEL = "saarika:v2.5"


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
            "text": text, "target_language_code": language, "speaker": TTS_SPEAKER, "model": TTS_MODEL,
        })
        return base64.b64decode(self._field(data, "/text-to-speech", "audios", 0))

    def stt(self, audio: bytes, filename: str, content_type: str = "audio/wav") -> Transcript:
        data = self._post(
            "/speech-to-text",
            files={"file": (filename, audio, content_type)},
            data={"model": STT_MODEL, "language_code": "unknown"},
        )
        return Transcript(self._field(data, "/speech-to-text", "transcript"), data.get("language_code") or "hi-IN")


def get_sarvam() -> SarvamClient | None:
    return SarvamClient(settings.sarvam_api_key) if settings.sarvam_api_key else None
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_sarvam.py -v` → Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(sarvam): translate, TTS and STT client"
```

---

### Task 2: Sarvam-localized voice guidance in the non-compliant branch

**Files:**
- Create: `backend/app/services/localization.py`
- Modify: `backend/app/services/photos.py` (add `store_media`), `backend/app/services/actions.py` (`create_guidance`)
- Test: `backend/tests/test_localization.py`

**Interfaces:**
- Consumes: `Guidance` from `guidance.py`, `get_sarvam`, `SarvamError`.
- Produces: `photos.store_media(data: bytes, prefix: str, ext: str) -> str`, `LocalizedGuidance(text: str, audio_path: str | None, engine: str)` (engine is `sarvam`, `sarvam_tts` or `template`), `localize_guidance(g: Guidance, name_prefix: str) -> LocalizedGuidance`. `create_guidance` now stores `message_text=loc.text` and `audio_path=loc.audio_path`, and logs the engine.

- [ ] **Step 1: Write the failing test `backend/tests/test_localization.py`**

```python
import base64
from pathlib import Path

import httpx
import respx

from app.config import settings
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


def test_no_key_uses_template_without_network(db):
    world = make_world(db)
    v = run_inline(db, make_visit(db, world, sharp_jpeg(92)).id)
    assert v.intervention.message_text.startswith("नमस्ते Ramesh जी")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_localization.py -v` → Expected: FAIL on the first test (message is the template, no audio)

- [ ] **Step 3: Add `store_media` to `backend/app/services/photos.py`**

```python
def store_media(data: bytes, prefix: str, ext: str) -> str:
    name = f"{prefix}_{uuid.uuid4().hex[:8]}{ext}"
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    (path / name).write_bytes(data)
    return name
```

- [ ] **Step 4: Implement `backend/app/services/localization.py`**

```python
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
    """English system diagnosis -> Sarvam translate -> Sarvam TTS. Falls back to curated templates."""
    client = get_sarvam()
    if client is None:
        return LocalizedGuidance(g.text_local, None, "template")

    text, engine = g.text_local, "template"
    try:
        text = client.translate(g.text_en, "en-IN", g.language)
        engine = "sarvam"
    except SarvamError as exc:
        log.warning("Sarvam translate failed, using template: %s", exc)

    audio_path = None
    try:
        audio_path = store_media(client.tts(text, g.language), name_prefix, ".wav")
        engine = "sarvam" if engine == "sarvam" else "sarvam_tts"
    except SarvamError as exc:
        log.warning("Sarvam TTS failed, sending text only: %s", exc)
    return LocalizedGuidance(text, audio_path, engine)
```

- [ ] **Step 5: Update `create_guidance` in `backend/app/services/actions.py`**

Replace the function body after the idempotency check with:
```python
    g = build_guidance(visit.merchant, visit.audit, ctx)
    loc = localize_guidance(g, f"guidance_visit{visit.id}")
    iv = models.Intervention(
        merchant_id=visit.merchant_id, visit_id=visit.id, action=g.action, issue=g.issue,
        message_text_en=g.text_en, message_text=loc.text, message_language=g.language, audio_path=loc.audio_path,
    )
    db.add(iv)
    append_step(visit, "guidance", f"{loc.engine}: {g.issue} guidance in {g.language}"
                + (" with voice note" if loc.audio_path else ""), {"text": loc.text})
    db.commit()
    return iv
```
Add the import `from app.services.localization import localize_guidance`.

- [ ] **Step 6: Run the tests**

Run: `pytest -v` → Expected: all PASS (P0 tests still pass because there is no key in tests)

- [ ] **Step 7: Live check**

With `SARVAM_API_KEY` set, run `scripts/demo_visit.sh demo_photos/counter_bad.jpg`. Then open `actions.intervention.audio_url` in a browser. Expected: a Hindi voice note telling Ramesh ji to move the QR next to the billing counter.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(sarvam): translate English diagnosis and voice it in the merchant's language"
```

---

### Task 3: Real WhatsApp delivery via Twilio (with demo redirect)

**Files:**
- Modify: `backend/app/services/whatsapp.py`, `backend/app/services/actions.py` (`send_whatsapp` records the actual recipient)
- Test: `backend/tests/test_whatsapp.py`

**Interfaces:**
- Produces: `send_whatsapp_message(to_phone, body, media_url=None) -> SendResult`. The result is Twilio-backed when `WHATSAPP_MODE=twilio`. `resolve_recipient(to_phone) -> str` returns `WHATSAPP_DEMO_TO` when set.

- [ ] **Step 1: Write the failing test `backend/tests/test_whatsapp.py`**

```python
import httpx
import respx

from app.config import settings
from app.services.whatsapp import resolve_recipient, send_whatsapp_message

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
def test_twilio_error_is_recorded_not_raised(monkeypatch):
    _twilio(monkeypatch)
    respx.post(URL).mock(return_value=httpx.Response(400, json={"message": "not in sandbox"}))
    r = send_whatsapp_message("+91981", "hi")
    assert r.status == "failed" and "sandbox" in r.error


def test_demo_redirect(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_demo_to", "+919999999999")
    assert resolve_recipient("+919811111111") == "+919999999999"


def test_dry_run_default():
    assert send_whatsapp_message("+91981", "hi").status == "dry_run"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_whatsapp.py -v` → Expected: FAIL (`ImportError: resolve_recipient`)

- [ ] **Step 3: Replace `backend/app/services/whatsapp.py`**

```python
import logging
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from app.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SendResult:
    status: str  # dry_run | sent | failed
    provider_ref: str | None = None
    error: str | None = None


def resolve_recipient(to_phone: str) -> str:
    return settings.whatsapp_demo_to or to_phone


def _is_public(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return host not in ("localhost", "127.0.0.1", "0.0.0.0") and not host.startswith(("192.168.", "10."))


def _send_twilio(to_phone: str, body: str, media_url: str | None) -> SendResult:
    sid = settings.twilio_account_sid
    data = {"From": f"whatsapp:{settings.twilio_whatsapp_from}", "To": f"whatsapp:{to_phone}", "Body": body}
    if media_url and _is_public(media_url):
        data["MediaUrl"] = media_url
    try:
        res = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data=data, auth=(sid, settings.twilio_auth_token), timeout=10.0,
        )
    except httpx.HTTPError as exc:
        return SendResult("failed", error=str(exc))
    if res.status_code >= 400:
        return SendResult("failed", error=res.text[:300])
    return SendResult("sent", provider_ref=res.json().get("sid"))


def send_whatsapp_message(to_phone: str, body: str, media_url: str | None = None) -> SendResult:
    if settings.whatsapp_mode == "twilio" and settings.twilio_account_sid:
        return _send_twilio(to_phone, body, media_url)
    log.info("WhatsApp dry-run to %s: %s", to_phone, body)
    return SendResult(status="dry_run")
```

- [ ] **Step 4: Record the real recipient in `actions.send_whatsapp`**

In `backend/app/services/actions.py`, replace the send and notification lines with:
```python
    to_phone = resolve_recipient(visit.merchant.phone)
    result = send_whatsapp_message(to_phone, iv.message_text, iv.audio_url)
    n = models.Notification(
        merchant_id=visit.merchant_id, visit_id=visit.id, channel="whatsapp", to_phone=to_phone,
        body=iv.message_text, audio_url=iv.audio_url, status=result.status,
        provider_ref=result.provider_ref, error=result.error,
    )
```
Update the import to `from app.services.whatsapp import resolve_recipient, send_whatsapp_message`.

- [ ] **Step 5: Run the tests**

Run: `pytest -v` → Expected: all PASS

- [ ] **Step 6: Live check with the Twilio sandbox**

1. In the Twilio console, go to Messaging → Try WhatsApp. Send `join <code>` from the demo phone to +1 415 523 8886.
2. Set `WHATSAPP_MODE=twilio`, the `TWILIO_*` values and `WHATSAPP_DEMO_TO=+91<demo phone>`.
3. For the voice note to arrive, the backend must be public (e.g. `ngrok http 8000`). Set `PUBLIC_BASE_URL` to the ngrok URL.
4. Run `scripts/demo_visit.sh demo_photos/counter_bad.jpg`.

Expected: the demo phone receives the Hindi text, plus the audio when the URL is public.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(whatsapp): Twilio delivery with demo recipient redirect and failure recording"
```

---

### Task 4: Rep intelligence — priority queue, next-best merchant, coverage, performance, visit map

**Files:**
- Create: `backend/app/services/rep.py`, `backend/app/api/fse.py`
- Modify: `backend/app/main.py` (register `fse` router)
- Test: `backend/tests/test_rep.py`

**Interfaces:**
- Consumes: models, `haversine_m`, `ACTION_LABELS`, `visit_summary`, `utcnow`.
- Produces:
  - `priority_queue(db, fse_id, lat=None, lng=None, now=None) -> list[dict]`. Each item has `merchant_id, name, owner_name, lat, lng, distance_m, priority, reasons[], latest_score, latest_decision, days_since_visit`. Items are sorted by priority, highest first. Merchants visited today are excluded
  - `coverage(db, fse_id, now=None, days=30) -> dict` with `{assigned, visited, coverage_pct}`
  - `performance(db, fse_id, now=None, days=30) -> dict` with `{visits, verified_pct, compliant_pct, avg_authenticity, incentives_inr, conversions}`
  - `fse_summary(db, fse_id, lat=None, lng=None, now=None) -> dict` with `{fse, coverage, performance, next_best}`
  - Routes: `GET /api/fse`, `GET /api/fse/{id}/queue?lat=&lng=`, `GET /api/fse/{id}/summary?lat=&lng=`, `GET /api/fse/{id}/visits?days=7`

- [ ] **Step 1: Write the failing test `backend/tests/test_rep.py`**

```python
from datetime import date, datetime

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.rep import coverage, fse_summary, performance, priority_queue

NOW = datetime(2026, 9, 25, 12, 0)


def _amit(db):
    return db.scalar(select(models.FseProfile).join(models.User, models.FseProfile.user_id == models.User.id)
                     .where(models.User.name == "Amit Patil"))


def test_queue_is_sorted_and_explains_itself(db):
    seed(db, today=date(2026, 9, 25))
    q = priority_queue(db, _amit(db).id, now=NOW)
    assert len(q) == 8
    assert [r["priority"] for r in q] == sorted((r["priority"] for r in q), reverse=True)
    ramesh = next(r for r in q if r["name"] == "Ramesh General Store")
    assert "Last QR score 42" in ramesh["reasons"]
    assert "Open issue: QR obstruction" in ramesh["reasons"]
    assert ramesh["days_since_visit"] == 20


def test_distance_changes_ranking(db):
    seed(db, today=date(2026, 9, 25))
    fse = _amit(db)
    ramesh = db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))
    q = priority_queue(db, fse.id, lat=ramesh.lat, lng=ramesh.lng, now=NOW)
    assert next(r for r in q if r["merchant_id"] == ramesh.id)["distance_m"] == 0


def test_coverage_and_performance(db):
    seed(db, today=date(2026, 9, 25))
    fse = _amit(db)
    assert coverage(db, fse.id, now=NOW) == {"assigned": 8, "visited": 8, "coverage_pct": 100.0}
    p = performance(db, fse.id, now=NOW)
    assert p["visits"] >= 8 and 0 <= p["verified_pct"] <= 100
    s = fse_summary(db, fse.id, now=NOW)
    assert s["next_best"]["merchant_id"] == priority_queue(db, fse.id, now=NOW)[0]["merchant_id"]
    assert s["fse"]["name"] == "Amit Patil"


def test_api(client, db):
    seed(db, today=date(2026, 9, 25))
    fse_id = _amit(db).id
    assert len(client.get("/api/fse").json()) == 3
    assert client.get(f"/api/fse/{fse_id}/queue").status_code == 200
    assert "coverage" in client.get(f"/api/fse/{fse_id}/summary").json()
    assert isinstance(client.get(f"/api/fse/{fse_id}/visits?days=60").json(), list)
    assert client.get("/api/fse/999/summary").status_code == 404
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_rep.py -v` → Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement `backend/app/services/rep.py`**

```python
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services.fraud.signals import haversine_m
from app.services.labels import ACTION_LABELS
from app.timeutil import utcnow


def _visits(db: Session, merchant_id: int) -> list[models.Visit]:
    return db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == merchant_id).order_by(models.Visit.received_at.desc())
    ).all()


def _txn_declining(db: Session, merchant_id: int) -> bool:
    rows = db.scalars(
        select(models.Transaction).where(models.Transaction.merchant_id == merchant_id)
        .order_by(models.Transaction.txn_date.desc()).limit(14)
    ).all()
    if len(rows) < 14:
        return False
    recent, prior = sum(r.amount_inr for r in rows[:7]), sum(r.amount_inr for r in rows[7:])
    return prior > 0 and recent < 0.9 * prior


def priority_queue(db: Session, fse_id: int, lat: float | None = None, lng: float | None = None, now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    start_today = datetime.combine(now.date(), time.min)
    merchants = db.scalars(select(models.Merchant).where(models.Merchant.assigned_fse_id == fse_id)).all()
    queue = []
    for m in merchants:
        visits = _visits(db, m.id)
        latest = visits[0] if visits else None
        if latest and latest.received_at >= start_today:
            continue  # already visited today
        reasons, priority = [], 0.0

        score = latest.audit.qr_visibility_score if latest and latest.audit else None
        if score is None:
            priority += 60
            reasons.append("Never audited")
        else:
            priority += 100 - score
            reasons.append(f"Last QR score {score}")

        days = (now - latest.received_at).days if latest else None
        priority += 60 if days is None else min(days, 30) * 2
        if days is not None and days >= 14:
            reasons.append(f"Not visited for {days} days")

        if latest and latest.decision in ("non_compliant", "low_confidence") and latest.audit:
            priority += 20
            reasons.append(f"Open issue: {ACTION_LABELS.get(latest.audit.recommended_action, latest.audit.recommended_action)}")

        if _txn_declining(db, m.id):
            priority += 15
            reasons.append("Transactions down >10% week on week")

        distance = None
        if lat is not None and lng is not None:
            distance = round(haversine_m(lat, lng, m.lat, m.lng))
            priority -= min(distance / 1000 * 5, 30)

        queue.append({
            "merchant_id": m.id, "name": m.name, "owner_name": m.owner_name, "lat": m.lat, "lng": m.lng,
            "distance_m": distance, "priority": round(priority, 1), "reasons": reasons,
            "latest_score": score, "latest_decision": latest.decision if latest else None, "days_since_visit": days,
        })
    queue.sort(key=lambda r: r["priority"], reverse=True)
    return queue


def coverage(db: Session, fse_id: int, now: datetime | None = None, days: int = 30) -> dict:
    now = now or utcnow()
    assigned = db.scalars(select(models.Merchant.id).where(models.Merchant.assigned_fse_id == fse_id)).all()
    visited = set(db.scalars(
        select(models.Visit.merchant_id).where(
            models.Visit.merchant_id.in_(assigned), models.Visit.received_at >= now - timedelta(days=days),
            models.Visit.status.in_(("completed", "escalated")),
        )
    ).all())
    pct = round(100 * len(visited) / len(assigned), 1) if assigned else 0.0
    return {"assigned": len(assigned), "visited": len(visited), "coverage_pct": pct}


def performance(db: Session, fse_id: int, now: datetime | None = None, days: int = 30) -> dict:
    now = now or utcnow()
    visits = db.scalars(
        select(models.Visit).where(models.Visit.fse_id == fse_id, models.Visit.received_at >= now - timedelta(days=days))
    ).all()
    n = len(visits)

    def pct(k):
        return round(100 * k / n, 1) if n else None

    conversions = 0
    for merchant_id in {v.merchant_id for v in visits}:
        history = [v.decision for v in reversed(_visits(db, merchant_id)) if v.decision]
        if any(a == "non_compliant" and b == "compliant" for a, b in zip(history, history[1:])):
            conversions += 1
    auth = [v.authenticity_score for v in visits if v.authenticity_score is not None]
    return {
        "visits": n,
        "verified_pct": pct(sum(1 for v in visits if v.authenticity_verdict == "VERIFIED")),
        "compliant_pct": pct(sum(1 for v in visits if v.decision == "compliant")),
        "avg_authenticity": round(sum(auth) / len(auth), 1) if auth else None,
        "incentives_inr": sum(v.incentive.amount_inr for v in visits if v.incentive),
        "conversions": conversions,
    }


def fse_summary(db: Session, fse_id: int, lat: float | None = None, lng: float | None = None, now: datetime | None = None) -> dict | None:
    fse = db.get(models.FseProfile, fse_id)
    if fse is None:
        return None
    queue = priority_queue(db, fse_id, lat, lng, now)
    return {
        "fse": {"id": fse.id, "name": fse.user.name, "territory": fse.territory},
        "coverage": coverage(db, fse_id, now),
        "performance": performance(db, fse_id, now),
        "next_best": queue[0] if queue else None,
    }
```

- [ ] **Step 4: Implement `backend/app/api/fse.py`**

```python
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.schemas import visit_summary
from app.services.rep import fse_summary, priority_queue
from app.timeutil import utcnow

router = APIRouter(prefix="/fse", tags=["rep intelligence"])


def _fse(db: Session, fse_id: int) -> models.FseProfile:
    fse = db.get(models.FseProfile, fse_id)
    if fse is None:
        raise HTTPException(404, "FSE not found")
    return fse


@router.get("")
def list_fse(db: Session = Depends(get_db)):
    return [{"id": f.id, "name": f.user.name, "territory": f.territory, "home_lat": f.home_lat, "home_lng": f.home_lng}
            for f in db.scalars(select(models.FseProfile)).all()]


@router.get("/{fse_id}/queue")
def queue(fse_id: int, lat: float | None = None, lng: float | None = None, db: Session = Depends(get_db)):
    _fse(db, fse_id)
    return priority_queue(db, fse_id, lat, lng)


@router.get("/{fse_id}/summary")
def summary(fse_id: int, lat: float | None = None, lng: float | None = None, db: Session = Depends(get_db)):
    _fse(db, fse_id)
    return fse_summary(db, fse_id, lat, lng)


@router.get("/{fse_id}/visits")
def visit_map(fse_id: int, days: int = 7, db: Session = Depends(get_db)):
    _fse(db, fse_id)
    q = (select(models.Visit)
         .where(models.Visit.fse_id == fse_id, models.Visit.received_at >= utcnow() - timedelta(days=days))
         .order_by(models.Visit.received_at))
    return [visit_summary(v).model_dump() for v in db.scalars(q).all()]
```

Register it in `main.py` by adding `fse` to the router loop.

- [ ] **Step 5: Run the tests**

Run: `pytest -v` → Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(rep): priority queue, next-best merchant, coverage, performance, visit map"
```

---

### Task 5: Voice assistant for reps (Sarvam STT → intent → answer → Sarvam TTS)

**Files:**
- Create: `backend/app/services/voice.py`, `backend/app/api/voice.py`
- Modify: `backend/app/main.py` (register `voice` router)
- Test: `backend/tests/test_voice.py`

**Interfaces:**
- Consumes: `get_sarvam`, `SarvamError`, `priority_queue`, `ACTION_LABELS`, `store_media`, models, `get_memory`.
- Produces:
  - `classify_intent(transcript: str) -> str`, one of `todays_visits | merchant_issue | unknown`
  - `VoiceAnswer(transcript, language, intent, answer_en, answer_local, audio_path, merchant_id)` with property `audio_url`
  - `answer_query(db, fse_id, transcript, language="en-IN", merchant_id=None, lat=None, lng=None) -> VoiceAnswer`
  - Routes: `POST /api/voice/query` (form `fse_id`, optional `merchant_id`, `lat`, `lng`, `text`; optional file `audio`) → answer JSON. `POST /api/voice/tts` (JSON `{text, language}`) → `{audio_url}` (503 if Sarvam unavailable)

- [ ] **Step 1: Write the failing test `backend/tests/test_voice.py`**

```python
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


def test_todays_visits_lists_top_three(db):
    seed(db, today=date(2026, 9, 25))
    _, fid = _ids(db)
    a = answer_query(db, fid, "Aaj mujhe kaunse merchants visit karne hain?")
    assert a.answer_en.startswith("Visit today:") and a.answer_en.count(". ") >= 3


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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_voice.py -v` → Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement `backend/app/services/voice.py`**

```python
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.labels import ACTION_LABELS
from app.services.memory import get_memory
from app.services.photos import store_media
from app.services.rep import priority_queue
from app.services.sarvam import SarvamError, get_sarvam

log = logging.getLogger(__name__)

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
    latest = db.scalars(
        select(models.Visit).where(models.Visit.merchant_id == merchant_id, models.Visit.decision.is_not(None))
        .order_by(models.Visit.received_at.desc()).limit(1)
    ).first()
    if latest is None or latest.audit is None:
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


def _todays_visits(db: Session, fse_id: int, lat, lng) -> str:
    top = priority_queue(db, fse_id, lat, lng)[:3]
    if not top:
        return "All your merchants are covered today."
    lines = [f"{i}. {r['name']}, {r['reasons'][0].lower()}" for i, r in enumerate(top, 1)]
    return "Visit today: " + ". ".join(lines) + "."


def answer_query(db: Session, fse_id: int, transcript: str, language: str = "en-IN",
                 merchant_id: int | None = None, lat: float | None = None, lng: float | None = None) -> VoiceAnswer:
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
            log.warning("voice translate failed: %s", exc)
        try:
            audio_path = store_media(client.tts(answer_local, language), "voice_answer", ".wav")
        except SarvamError as exc:
            log.warning("voice TTS failed: %s", exc)
    return VoiceAnswer(transcript, language, intent, answer_en, answer_local, audio_path, merchant_id)
```

- [ ] **Step 4: Implement `backend/app/api/voice.py`**

```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.services.photos import store_media
from app.services.sarvam import SarvamError, get_sarvam
from app.services.voice import answer_query

router = APIRouter(prefix="/voice", tags=["voice (Sarvam)"])


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
    if audio is None and not text:
        raise HTTPException(422, "Send either an audio file or text")
    if audio is not None:
        client = get_sarvam()
        if client is None:
            raise HTTPException(503, "Speech-to-text needs SARVAM_API_KEY")
        try:
            t = client.stt(audio.file.read(), audio.filename or "query.wav", audio.content_type or "audio/wav")
        except SarvamError as exc:
            raise HTTPException(502, f"Sarvam STT failed: {exc}")
        text, language = t.text, t.language_code
    a = answer_query(db, fse_id, text, language, merchant_id, lat, lng)
    return {"transcript": a.transcript, "language": a.language, "intent": a.intent, "answer_en": a.answer_en,
            "answer_local": a.answer_local, "audio_url": a.audio_url, "merchant_id": a.merchant_id}


class TtsIn(BaseModel):
    text: str
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
    return {"audio_url": f"{settings.public_base_url}/media/{path}"}
```

Register it in `main.py` by adding `voice` to the router loop.

- [ ] **Step 5: Run the tests**

Run: `pytest -v` → Expected: all PASS

- [ ] **Step 6: Live check**

Record yourself saying "Aaj mujhe kaunse merchants visit karne hain?" as `q.wav`, then:
```bash
curl -s -F fse_id=1 -F "audio=@q.wav;type=audio/wav" localhost:8000/api/voice/query | python -m json.tool
```
Expected: `intent: todays_visits`, a Hindi `answer_local` naming three shops, and an `audio_url` that plays it.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(voice): Sarvam-powered rep assistant for today's visits and merchant problems"
```

---

### Task 6: Cognee merchant memory with SQL fallback

**Files:**
- Create: `backend/app/services/memory/cognee_memory.py`, `backend/app/memory_backfill.py`
- Modify: `backend/app/services/memory/__init__.py` (`get_memory`), `backend/pyproject.toml` (optional extra)
- Test: `backend/tests/test_cognee_memory.py`

**Interfaces:**
- Consumes: `SqlMemory`, `MerchantContext`, `summarize`, models, `ACTION_LABELS`, `settings.cognee_timeout_s`.
- Produces:
  - `CogneeAdapter` with `.add(text: str, dataset: str) -> None` and `.search(query: str, dataset: str) -> str`. This is the only code that touches the `cognee` library
  - `visit_memory_document(visit) -> str`
  - `CogneeMemory(adapter=None, fallback=None)` implements `MemoryStore`. `get_context` returns SQL facts, with `summary` from Cognee and `source="cognee"`. On Cognee error or timeout it uses the SQL summary with `source="sql_fallback"`. `record_visit_outcome` adds the visit document in a background thread
  - `get_memory()` returns `CogneeMemory()` when `MEMORY_BACKEND=cognee`, else `SqlMemory()`

- [ ] **Step 1: Probe the installed Cognee API (10 min)**

```bash
pip install cognee
python - <<'EOF'
import inspect, cognee
print(cognee.__version__ if hasattr(cognee, "__version__") else "?")
for name in ("add", "cognify", "search"):
    print(name, inspect.signature(getattr(cognee, name)))
from cognee import SearchType; print(list(SearchType)[:6])
EOF
```
Confirm these, and adjust `CogneeAdapter` in Step 4 if any differ:
- `add(data, dataset_name=...)`
- `cognify(datasets=[...])`
- `search(query_text=..., query_type=SearchType.GRAPH_COMPLETION, datasets=[...])`
- the import location of `SearchType`

Configure Cognee's LLM and embedding provider through its env vars (`LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, embedding settings) per the Cognee docs. Cognee needs an embedding model; Anthropic does not provide one. If `pip install cognee` fails on this Python, skip the live parts. The tests below use a fake adapter, and the SQL fallback keeps the demo working.

Add to `pyproject.toml`: `memory = ["cognee"]` under `[project.optional-dependencies]`.

- [ ] **Step 2: Write the failing test `backend/tests/test_cognee_memory.py`**

```python
import time
from datetime import date

from sqlalchemy import select

from app import models
from app.seed import seed
from app.services.memory.cognee_memory import CogneeMemory, visit_memory_document


class FakeAdapter:
    def __init__(self, answer="Ramesh: QR was blocked by a PhonePe standee; repositioned on 5 Sep.", fail=False, delay=0.0):
        self.answer, self.fail, self.delay, self.added = answer, fail, delay, []

    def add(self, text, dataset):
        self.added.append((dataset, text))

    def search(self, query, dataset):
        time.sleep(self.delay)
        if self.fail:
            raise RuntimeError("cognee down")
        return self.answer


def _ramesh(db):
    seed(db, today=date(2026, 9, 25))
    return db.scalar(select(models.Merchant).where(models.Merchant.name == "Ramesh General Store"))


def test_context_combines_sql_facts_with_cognee_summary(db):
    m = _ramesh(db)
    ctx = CogneeMemory(adapter=FakeAdapter()).get_context(db, m.id)
    assert ctx.source == "cognee"
    assert "PhonePe standee" in ctx.summary
    assert ctx.previous_scores == [42, 38]


def test_cognee_failure_or_timeout_falls_back_to_sql(db, monkeypatch):
    m = _ramesh(db)
    assert CogneeMemory(adapter=FakeAdapter(fail=True)).get_context(db, m.id).source == "sql_fallback"
    from app.config import settings
    monkeypatch.setattr(settings, "cognee_timeout_s", 0.05)
    ctx = CogneeMemory(adapter=FakeAdapter(delay=0.5)).get_context(db, m.id)
    assert ctx.source == "sql_fallback" and "42" in ctx.summary


def test_visit_document_captures_relationships(db):
    m = _ramesh(db)
    visit = db.scalars(select(models.Visit).where(models.Visit.merchant_id == m.id).order_by(models.Visit.received_at.desc())).first()
    doc = visit_memory_document(visit)
    for fragment in ("Merchant: Ramesh General Store", "Rep: Amit Patil", "QR visibility score: 42",
                     "Issue: QR obstruction", "Competitor: PhonePe (high)", "Intervention: clear_qr_obstruction", "Outcome: non_compliant"):
        assert fragment in doc


def test_record_visit_outcome_adds_document(db):
    m = _ramesh(db)
    fake = FakeAdapter()
    mem = CogneeMemory(adapter=fake)
    visit = db.scalars(select(models.Visit).where(models.Visit.merchant_id == m.id)).first()
    mem.record_visit_outcome(db, visit, background=False)
    assert fake.added[0][0] == f"merchant_{m.id}"
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pytest tests/test_cognee_memory.py -v` → Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 4: Implement `backend/app/services/memory/cognee_memory.py`**

```python
import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.labels import ACTION_LABELS
from app.services.memory.base import MerchantContext
from app.services.memory.sql_memory import SqlMemory, summarize

log = logging.getLogger(__name__)
_pool = ThreadPoolExecutor(max_workers=4)


class CogneeAdapter:
    """The only place that touches the cognee library."""

    def add(self, text: str, dataset: str) -> None:
        import cognee

        async def _run():
            await cognee.add(text, dataset_name=dataset)
            await cognee.cognify(datasets=[dataset])

        asyncio.run(_run())

    def search(self, query: str, dataset: str) -> str:
        import cognee
        from cognee import SearchType

        async def _run():
            return await cognee.search(query_text=query, query_type=SearchType.GRAPH_COMPLETION, datasets=[dataset])

        results = asyncio.run(_run())
        return "\n".join(str(r) for r in results) if results else ""


def visit_memory_document(visit: models.Visit) -> str:
    a, m = visit.audit, visit.merchant
    lines = [
        f"Merchant: {m.name} (id {m.id}, owner {m.owner_name}, {m.category}, {m.address})",
        f"Rep: {visit.fse.user.name}",
        f"Visit date: {visit.received_at.date().isoformat()}",
        f"Authenticity: {visit.authenticity_score}/100 {visit.authenticity_verdict}",
    ]
    if a:
        lines += [
            f"QR visibility score: {a.qr_visibility_score}",
            f"Issue: {ACTION_LABELS.get(a.recommended_action, a.recommended_action)}",
            f"Competitor: {a.competitor or 'none'} ({a.competitor_dominance})",
            f"Soundbox visible: {'yes' if a.soundbox_visible else 'no'}",
        ]
    if visit.intervention:
        lines.append(f"Intervention: {visit.intervention.action} ({visit.intervention.message_language})")
    if visit.incentive:
        lines.append(f"Incentive: ₹{visit.incentive.amount_inr} {visit.incentive.status}")
    lines.append(f"Outcome: {visit.decision}")
    return "\n".join(lines)


class CogneeMemory:
    def __init__(self, adapter=None, fallback: SqlMemory | None = None):
        self.adapter = adapter or CogneeAdapter()
        self.fallback = fallback or SqlMemory()

    def get_context(self, db: Session, merchant_id: int, exclude_visit_id: int | None = None) -> MerchantContext:
        ctx = self.fallback.get_context(db, merchant_id, exclude_visit_id)
        query = (f"Summarize what we know about merchant {ctx.merchant_name}: previous QR issues, competitors, "
                 f"interventions and their outcomes. Two sentences.")
        future = _pool.submit(self.adapter.search, query, f"merchant_{merchant_id}")
        try:
            answer = future.result(timeout=settings.cognee_timeout_s)
        except (FutureTimeout, Exception) as exc:
            log.warning("Cognee context unavailable (%s); using SQL memory", exc)
            ctx.source = "sql_fallback"
            return ctx
        if answer.strip():
            ctx.summary, ctx.source = answer.strip(), "cognee"
            ctx.extra["sql_summary"] = summarize(ctx)
        else:
            ctx.source = "sql_fallback"
        return ctx

    def record_visit_outcome(self, db: Session, visit: models.Visit, background: bool = True) -> None:
        doc, dataset = visit_memory_document(visit), f"merchant_{visit.merchant_id}"

        def _add():
            try:
                self.adapter.add(doc, dataset)
            except Exception:
                log.exception("Cognee add failed for visit %s", visit.id)

        if background:
            threading.Thread(target=_add, daemon=True).start()
        else:
            _add()
```

- [ ] **Step 5: Switch `get_memory` in `backend/app/services/memory/__init__.py`**

```python
def get_memory() -> MemoryStore:
    if settings.memory_backend == "cognee":
        from app.services.memory.cognee_memory import CogneeMemory

        return CogneeMemory()
    return SqlMemory()
```

- [ ] **Step 6: Implement `backend/app/memory_backfill.py`**

```python
"""Load seeded visit history into Cognee.  Usage: MEMORY_BACKEND=cognee python -m app.memory_backfill"""

from sqlalchemy import select

from app import models
from app.db import SessionLocal
from app.services.memory.cognee_memory import CogneeMemory


def main() -> None:
    mem = CogneeMemory()
    with SessionLocal() as db:
        visits = db.scalars(select(models.Visit).where(models.Visit.decision.is_not(None)).order_by(models.Visit.received_at)).all()
        for i, v in enumerate(visits, 1):
            mem.record_visit_outcome(db, v, background=False)
            print(f"{i}/{len(visits)} visit {v.id} -> merchant_{v.merchant_id}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Run the tests**

Run: `pytest -v` → Expected: all PASS

- [ ] **Step 8: Live check**

```bash
MEMORY_BACKEND=cognee python -m app.memory_backfill      # only Ramesh is needed for the demo; ctrl-C after it if slow
MEMORY_BACKEND=cognee uvicorn app.main:app --host 0.0.0.0 --port 8000 &
curl -s localhost:8000/api/merchants/1 | python -c 'import sys,json; c=json.load(sys.stdin)["context"]; print(c["source"], "|", c["summary"])'
```
Expected: `cognee | Ramesh General Store ... QR obstruction ... repositioned ...`. In n8n, the "Cognee Context" node output shows the same summary.

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(memory): Cognee merchant memory with SQL fallback and history backfill"
```

---

### Task 7: Update the API contract

**Files:**
- Modify: `docs/api-contract.md`

- [ ] **Step 1: Append the P1 endpoints to the contract**

```markdown
## Rep intelligence
- `GET /fse` → [{id, name, territory, home_lat, home_lng}]
- `GET /fse/{id}/queue?lat=&lng=` → [{merchant_id, name, owner_name, lat, lng, distance_m, priority, reasons[], latest_score, latest_decision, days_since_visit}] (sorted; visited-today excluded)
- `GET /fse/{id}/summary?lat=&lng=` → {fse, coverage{assigned, visited, coverage_pct}, performance{visits, verified_pct, compliant_pct, avg_authenticity, incentives_inr, conversions}, next_best}
- `GET /fse/{id}/visits?days=7` → visit pins for the map

## Voice (Sarvam)
- `POST /voice/query` multipart: fse_id, merchant_id?, lat?, lng?, and either `audio` (wav/webm) or `text` (+ language)
  → {transcript, language, intent (todays_visits|merchant_issue|unknown), answer_en, answer_local, audio_url}
- `POST /voice/tts` {text, language} → {audio_url}

## Changes to existing payloads
- `actions.intervention.audio_url` now holds the Sarvam voice note (null if Sarvam is unavailable)
- `merchant.context.source` is `cognee` | `sql` | `sql_fallback`
```

- [ ] **Step 2: Commit**

```bash
git add docs/api-contract.md
git commit -m "docs: add rep intelligence and voice endpoints to the API contract"
```
