# SightPay backend

    cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
    cp .env.example .env          # set VISION_PROVIDER=claude + ANTHROPIC_API_KEY for live AI
    python -m app.seed            # --demo-location LAT,LNG puts every merchant at the venue (see below)
    uvicorn app.main:app --host 0.0.0.0 --port 8000
    pytest

`/api/health` shows `"anthropic_key": true` once `ANTHROPIC_API_KEY` in `.env` has been picked up.

## Demo-day settings (`backend/.env`)

- `PUBLIC_BASE_URL=http://<LAN-IP>:8000` (e.g. `http://192.168.1.20:8000`, from `ip addr` / `ipconfig`). Photo and
  audio URLs in API responses are absolute and built from this. The default `http://localhost:8000` breaks every
  image on the phone or on any laptop other than the server.
- `GPS_RADIUS_M=200` (recommended for the demo). Indoor GPS drifts by 50-150 m, and the default 100 m radius would turn
  an honest visit into a GPS warning (−20) and push it towards manager review.
- Seed with `python -m app.seed --demo-location LAT,LNG` using the venue's coordinates. Ramesh General Store is placed
  exactly on that point and every other merchant within ~110 m of it (always under 150 m), so any merchant can be visited on stage.

## Optional P1 integrations (`backend/.env`)

Every key below may stay empty: the backend then uses the Hindi/Marathi templates, no audio, WhatsApp `dry_run` and SQL
memory.

- `SARVAM_API_KEY`: Sarvam translates the English guidance into the merchant's language and voices it (the voice note
  becomes `audio_url`), and powers `/api/voice/*`. The Sarvam constants in `app/services/sarvam.py` were checked against
  the sarvamai SDK 0.1.34 API definition: TTS sends `language_code` (`bulbul:v2`), STT uses `saaras:v3`, translate
  uses `mayura:v1`.
- `WHATSAPP_MODE=twilio` + `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (+ `TWILIO_WHATSAPP_FROM`, default the Twilio
  sandbox number) sends real WhatsApp messages. Twilio is used only when the mode is `twilio` and both credentials are
  set; otherwise messages stay `dry_run`. Voice notes are attached only when `PUBLIC_BASE_URL` is publicly reachable
  (Twilio cannot fetch `localhost` or LAN addresses).
- `WHATSAPP_DEMO_TO=+91...`: **set this for demos.** Every WhatsApp goes to this number instead of the merchant's.
- `MEMORY_BACKEND=cognee` uses Cognee for merchant memory. Install it and load the seeded history first:

      pip install -e ".[memory]"
      MEMORY_BACKEND=cognee python -m app.memory_backfill

  `COGNEE_TIMEOUT_S` (default 8) caps each Cognee lookup; on timeout or error the SQL memory is used
  (`source: "sql_fallback"`).

  Cognee needs its own LLM and embedding provider (for example `LLM_API_KEY`, plus `LLM_PROVIDER`/`LLM_MODEL` and the
  `EMBEDDING_*` settings if you do not use its OpenAI defaults), set in the environment as described in Cognee's docs.
  These are Cognee's settings, not SightPay's. Without them `cognify` and search fail, and every lookup silently
  becomes `sql_fallback`: check the `merchant_context` step's `data.source` to confirm Cognee is actually answering.

Demo: `scripts/demo_visit.sh demo_photos/counter_bad.jpg` → non-compliant → Hindi WhatsApp guidance.
Offline safety net: VISION_PROVIDER=fixture + photos pinned via scripts/register_fixture.py; unset N8N_WEBHOOK_URL to run inline.

## Demo photos

`demo_photos/` is not committed — there are no real rehearsed counter photos in the repo. Before a demo, either:

- point a phone or the frontend camera at a real counter and submit a real photo, or
- generate synthetic stand-ins for an offline dry run:

      .venv/bin/python -c "
      import numpy as np
      from PIL import Image
      Image.fromarray(np.random.default_rng(1).integers(0, 256, (600, 800, 3), dtype='uint8'), 'RGB').save('demo_photos/counter_good.jpg', quality=90)
      Image.fromarray(np.random.default_rng(42).integers(0, 256, (600, 800, 3), dtype='uint8'), 'RGB').save('demo_photos/counter_bad.jpg', quality=90)
      Image.fromarray(np.full((600, 800, 3), 128, dtype='uint8'), 'RGB').save('demo_photos/counter_blurry.jpg', quality=90)
      "
      python scripts/register_fixture.py demo_photos/counter_good.jpg compliant
      python scripts/register_fixture.py demo_photos/counter_bad.jpg non_compliant

  (`counter_blurry.jpg` needs no fixture pin: the blur/dark quality gate runs before the vision fixture lookup.)

## Full dry run (inline, fixture vision)

    cd backend && rm -f sightpay.db && python -m app.seed && uvicorn app.main:app --port 8000 &
    sleep 2
    scripts/demo_visit.sh demo_photos/counter_good.jpg   # expect: compliant, incentive
    scripts/demo_visit.sh demo_photos/counter_bad.jpg    # expect: non_compliant, guidance, whatsapp
    scripts/demo_visit.sh demo_photos/counter_bad.jpg    # expect: fraud (duplicate photo) -> blocked
    scripts/demo_visit.sh demo_photos/counter_blurry.jpg # expect: low_confidence -> escalated
    curl -s localhost:8000/api/dashboard | python -m json.tool | head -30

The dashboard KPIs reflect the new visits. See `docs/api-contract.md` (repo root) for the full API reference with real
example payloads.
