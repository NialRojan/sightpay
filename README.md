# SightPay

Field intelligence for merchant counters: a rep photographs a counter, the backend checks the evidence (GPS, capture
time, photo reuse, metadata), audits it with vision AI, decides (incentive, guidance in the merchant's language plus
WhatsApp, manager review, or block) and tracks the observed change in the merchant's transactions afterwards.

- `backend/`: FastAPI + SQLite ([backend/README.md](backend/README.md) for keys and demo settings)
- `frontend/`: Vite + React ([frontend/README.md](frontend/README.md))
- `docs/api-contract.md`: every endpoint and payload
- `n8n/`: optional workflow that runs the pipeline steps

## Run the full app

Two terminals. No API keys are needed: without them vision uses fixtures, guidance uses templates (no voice notes)
and WhatsApp is logged (`dry_run`). `GET /api/health` shows which providers are live.

```bash
# 1. backend (http://localhost:8000)
cd backend
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"   # first time only
cp .env.example .env                                         # first time only; add keys here
.venv/bin/python -m app.seed                                 # fresh demo data (wipes the database)
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. frontend (http://localhost:5173)
cd frontend
npm install                                                  # first time only
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/media` to the backend (`BACKEND_URL`, default
`http://localhost:8000`), so the browser only ever talks to port 5173.

**Signing in** (there is no password; the choice is stored in the browser):

- *Field Sales Executive*: pick a rep (Amit Patil, Sneha Joshi, Rahul Verma) → rep dashboard, priority queue,
  Merchant 360, visit evidence, and the FSE mobile app (`/fse/mobile`) where visits are captured.
- *Admin / Manager*: type your name (recorded as the approver) → Manager Command Center (escalations to approve or
  reject, flagged visits, team coverage), impact analytics.

### On a phone

- **Same Wi-Fi (quickest):** open the `Network:` URL that `npm run dev` prints (`http://<laptop-IP>:5173`). Browsers
  give GPS only to `https` or `localhost` pages, so on plain http the capture screen offers **"Demo: use shop
  location"** (clearly labelled; it makes the GPS check pass). The camera works through the photo picker.
- **HTTPS tunnel (real GPS, and WhatsApp voice notes / delivery callbacks):** run `ngrok http 5173` and open the
  `https://….ngrok-free.app` URL on the phone. One tunnel is enough: `/api` and `/media` go through the Vite proxy.
  Set `PUBLIC_BASE_URL=https://<your-subdomain>.ngrok-free.app` in `backend/.env` and restart the backend, so the
  photo/audio URLs and the Twilio status callback (`/api/webhooks/twilio/status`) use the public address. The dev
  server already accepts `*.ngrok-free.app`, `*.ngrok-free.dev`, `*.ngrok.app` and `*.ngrok.io` hosts.

For a demo at a venue, seed with `python -m app.seed --demo-location LAT,LNG` (every merchant within ~150 m of that
point) and set `GPS_RADIUS_M=200` (see [backend/README.md](backend/README.md)).

### Demo photos (offline, fixture vision)

With `VISION_PROVIDER=fixture` an unknown photo is audited as **non-compliant** (guidance + WhatsApp). Pin a photo to
another outcome by its file hash before the demo:

```bash
cd backend
.venv/bin/python scripts/register_fixture.py path/to/counter_good.jpg compliant   # or non_compliant | low_confidence | suspicious
```

This edits `backend/fixtures/vision_fixtures.json` (tracked: `git checkout` it afterwards if you do not want to
keep the pin). Submitting the same photo twice is **blocked** as a reused photo, and a gallery pick instead of the
camera costs authenticity points and goes to **manager review**.

### Checks

```bash
cd backend && .venv/bin/pytest -q
cd frontend && npm run build && npx oxlint src
```
