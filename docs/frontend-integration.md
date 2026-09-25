# Frontend ↔ backend integration map

Status as of the `feat/frontend-integration` foundation commit. Read this together with
[`api-contract.md`](api-contract.md) (the source of truth for every payload).

What is done:

- `frontend/src/services/api.js` is a real client: `get`, `post` (JSON), `postForm` (multipart), `request`, and
  `mediaUrl()`. Base path `/api`, overridable with `VITE_API_URL`. Non-2xx responses throw `ApiError`
  (`status`, `detail` = the backend's `detail` text, 422 validation arrays flattened). An unreachable backend throws
  `ApiError` with `status: 0`. **There is no silent demo fallback any more.**
- One service module per backend area, with a function for every frontend-facing route (table below).
- `frontend/vite.config.js` proxies `/api` and `/media` to `BACKEND_URL` (default `http://localhost:8000`) and
  listens on the LAN (`server.host: true`), for both `vite` and `vite preview`.
- `services/session.js` (current FSE + role in localStorage), `services/geo.js` (device GPS),
  `services/format.js` (UTC date parsing, labels for every backend enum).
- `services/legacy.js`: **temporary shims**. The old function names that pages still import (`getKpis`,
  `getMerchants`, `getVisit`, …) now call the real backend and add the old demo-shaped keys on top, so every page
  still renders without crashing. Each group removes its pages' use of them; the file is deleted in the final cleanup.
- Routes: `/fse/merchants`, `/fse/visits` and `/fse/evidence` no longer redirect to `m1` / `SP-10482`; they redirect
  to the current FSE's top-priority merchant and newest visit (`components/Redirects.jsx`). The sidebar links point at
  those redirects.
- `demoData.js` is untouched. Pages still import it (see the per-page notes).

Build: `npm run build` passes (only the pre-existing >500 kB chunk warning). `npm run lint` (oxlint): 24 pre-existing
warnings (unused imports, `set-state-in-effect`), 0 errors, and nothing new from the service layer.

---

## 1. Running it

```bash
# backend (from backend/)
DATABASE_URL=sqlite:///./dev.db .venv/bin/python -m app.seed
DATABASE_URL=sqlite:///./dev.db .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
# frontend (from frontend/)
npm run dev                                   # proxies /api + /media to http://localhost:8000
BACKEND_URL=http://10.0.0.5:8000 npm run dev  # backend elsewhere
VITE_API_URL=http://10.0.0.5:8000/api npm run build   # a static build that calls a backend directly (CORS is "*")
```

### Media URLs (`photo_url`, `audio_url`)

The backend makes them absolute from `PUBLIC_BASE_URL` (default `http://localhost:8000/media/...`), which is wrong on a
phone. **Always render them through `mediaUrl(url)`** (from `services/api.js`, also `visitPhotoUrl(visit)` in
`services/visits.js`). It keeps the `/media/...` path and loads it from the same origin (proxied by Vite), or from
`VITE_API_URL`'s origin when that is absolute. This also avoids mixed content if the frontend is served over HTTPS.
`photo_url` is `null` for every seeded visit: show a placeholder ("No photo: historical visit"). `audio_url` is `null`
without `SARVAM_API_KEY`: hide the play button and show the text.

### Phone access (important for the capture flow)

- `npm run dev` prints a `Network:` URL; a phone on the same Wi-Fi can open it.
- **Browsers only allow geolocation and `getUserMedia` in a secure context** (`https://` or `http://localhost`). On
  `http://<LAN-IP>:5173` `navigator.geolocation` is unavailable (`getCurrentPosition()` in `services/geo.js` returns
  `null`). The camera still works through `<input type="file" accept="image/*" capture="environment">`, which does
  not need a secure context, so use that rather than `getUserMedia`.
- To get GPS on a phone: serve the dev server over HTTPS (add `@vitejs/plugin-basic-ssl` and accept the certificate
  warning once), or tunnel it (`ngrok http 5173`). Proxying keeps API and media on the same HTTPS origin.
- `lat`/`lng` are **required** by `POST /visits`. If GPS is unavailable the capture screen must say so and ask the
  user. For demos only, it may offer "Use the shop's location (demo)", labelled in the UI and never done silently,
  because it makes the GPS signal pass.

### IDs

Every id is an integer: merchants 1-24, FSEs 1-3, visits 1-49 in the seed data (new visits count up from 50),
escalations, interventions and incentives too. Route params arrive as strings: pass them straight to the service
functions, and compare with `Number(id)`. Dead ids: `m1`…`m5`, `SP-10482`, `SP-M2`, `SP-FSE-8042`. Things that build
them today (each owning group must fix these):

| File | Code | Replace with |
| --- | --- | --- |
| `Fse.jsx` | `nav('/visits/SP-10482')`, `nav('/merchants/m1')` | START VISIT → `/fse/mobile?merchant=<merchant_id>` (capture happens in the mobile app) or `/merchants/<merchant_id>`; VIEW MERCHANT → `/merchants/<merchant_id>` |
| `PriorityQueue.jsx` | ``nav(`/visits/${m.id === 'm1' ? 'SP-10482' : …}`)``, `useState('m1')` | START VISIT → `/fse/mobile?merchant=<id>`; VIEW 360 → `/merchants/<id>`; selected = first queue `merchant_id` |
| `MerchantDetail.jsx` | `useParams() id = 'm1'`, `visitId = 'SP-…'`, visit history rows `SP-10482` | no default; latest visit id = `recent_visits[0]?.id`; rows from `recent_visits[]` → `/visits/<id>` |
| `VisitAudit.jsx` | `useParams() id = 'SP-10482'` | no default (the `/fse/visits` redirect handles "latest") |
| `Manager.jsx` | `exceptions[].id = 'SP-10482'` | escalation `id` for approve/reject, `visit_id` for links |
| `Pages.jsx` | `Navigate to="/merchants/m1"` etc. | **delete the file**: nothing imports it |

A merchant's "visit" page makes sense only after a capture, so "Start visit" means "go and capture" (mobile app), not
"open an old visit".

### Current rep and role (no auth in the backend)

- `Login.jsx` loads `GET /api/fse` (`listFse()`) and shows the reps as choices, plus a "Manager" choice.
  - FSE → `setRole('fse')`, `setCurrentFse(fse)`, go to `/fse/mobile`.
  - Manager → `setRole('manager')`, `setManagerName(<typed name or "Operations Manager">)`, go to `/manager`.
- Everything else reads `getCurrentFseId()` (defaults to 1, Amit Patil, when nothing is stored), `getCurrentFse()`,
  `getRole()`, `getManagerName()`. The manager name is sent as `resolved_by` on approve/reject.
- `Layout.jsx` shows the stored FSE (or the manager) in the sidebar/topbar, and "Log out" calls `signOut()` and goes to
  `/login`. No route guard is needed for the demo: pages fall back to FSE 1.
- The manager views (`/fse`, `/queue`, `/manager`, `/analytics`) can take an FSE selector (a dropdown fed by `listFse()`)
  where they show one rep's data (`/fse`, `/queue`).

---

## 2. Service functions (every backend route)

`/api/internal/*` and `/api/webhooks/*` are never called by the frontend.

| Module | Function | Route |
| --- | --- | --- |
| `visits.js` | `listVisits({fseId, merchantId, limit})` | `GET /visits` → `VisitSummary[]` |
| | `getVisitDetail(id)` | `GET /visits/{id}` → `VisitOut` |
| | `createVisit({merchantId, fseId, lat, lng, photo, capturedAt, captureSource='camera', analyze=true})` | `POST /visits` multipart → `VisitOut` |
| | `startVisitAnalysis(id)` | `POST /visits/{id}/analyze` → `VisitOut` (409 unless `submitted`/`failed`) |
| | `pollVisit(id, {intervalMs, timeoutMs, onUpdate, signal})` | polls `GET /visits/{id}` while `analyzing` |
| | `visitPhotoUrl(visit)`, `TERMINAL_STATUSES` | helpers |
| `merchants.js` | `listMerchants()` | `GET /merchants` |
| | `getMerchantDetail(id)` | `GET /merchants/{id}` |
| | `getMerchantImpact(id, interventionId?)` | `GET /merchants/{id}/impact` |
| `fse.js` | `listFse()` | `GET /fse` |
| | `getFseQueue(fseId, {lat, lng})` | `GET /fse/{id}/queue` |
| | `getFseSummary(fseId, {lat, lng})` | `GET /fse/{id}/summary` |
| | `getFseVisits(fseId, days=7)` | `GET /fse/{id}/visits` |
| `voice.js` | `askVoiceText({fseId, text, language, merchantId, lat, lng})` | `POST /voice/query` multipart (text) |
| | `askVoiceAudio({fseId, audio, merchantId, lat, lng})` | `POST /voice/query` multipart (audio) |
| | `textToSpeech(text, language)` | `POST /voice/tts` |
| `escalations.js` | `listEscalations(status='open')` | `GET /escalations?status=` |
| | `approveEscalation(id, note \| {note, resolvedBy})` | `POST /escalations/{id}/approve` |
| | `rejectEscalation(id, note \| {note, resolvedBy})` | `POST /escalations/{id}/reject` |
| `analytics.js` | `getDashboard()` | `GET /dashboard` (= `/analytics/dashboard`) |
| | `getPortfolioImpact()` | `GET /analytics/impact` |
| | `getSystemHealth()` | `GET /health` |
| `fraud.js` | `listFlaggedVisits()` | `GET /fraud/flagged` |
| | `getVisitFraud(visitId)` | `GET /fraud/{visit_id}` |
| `audits.js` | `getVisitAudit(visitId)` | `GET /audit/{visit_id}` |
| | `analyzeImage(photo)` | `POST /audit/analyze-image` multipart (stateless try-it) |
| `incentives.js` | `listIncentives(fseId?)` | `GET /incentives` |
| `transactions.js` | `listTransactions(merchantId, days=30)` | `GET /transactions` |

Legacy names (TODO(page), backed by `legacy.js`, real data in the old shape):

| Legacy export | Used by | Now returns |
| --- | --- | --- |
| `visits.getVisit(id)` / `analyzeVisit(id)` | VisitAudit | `VisitOut` **plus** `merchant, date, time, verification, evidenceChain, authenticitySignals, guidance` |
| `visits.getKpis/getMapPoints/getActivity`, `getVisits` | Fse | derived from the current FSE's summary/queue/visits |
| `merchants.getMerchant(id)` | MerchantDetail | `GET /merchants/{id}` body **plus** flat `id (string), name, location, km, qr, trend, competitor, comp` |
| `merchants.getMerchants()` | Fse | the current FSE's queue as old rows (`pri, km, qr, reasons, action, last`) |
| `merchants.getMerchantMemory(id)` | MerchantDetail | strings from `context.previous_issues/interventions/summary` |
| `merchants.getProfile()` | Fse | current FSE `{id, name, territory, first, role}` |
| `audits.getAlerts()` | Fse | open escalations as `{sev, title, m, at}` + the real row |
| `audits.getAudit(id)` | (none) | alias of `getVisitAudit` |
| `analytics.getHealth/getMini/getImpact` | Fse, Analytics | QR-score series, 4 mini KPIs, `/analytics/impact` + old `kpis`/`interventions` keys |

A page is migrated when it imports none of these names and no `../data/demoData`.

---

## 3. Page-by-page map

Notation: **today** = what the page renders/does now; **feed** = endpoint(s); **map** = backend field → UI.

### `/` Landing (`pages/Landing.jsx`)

- **Today:** marketing page. The only data use is `merchants[0].name` from demoData (a hero mock card). Buttons navigate
  to `/login`, `/fse`, `/manager`.
- **Plan:** keep it static: inline the name (`'Ramesh General Store'`) and drop the demoData import. Optionally show a
  "Backend: live · vision fixture · WhatsApp dry_run" chip from `getSystemHealth()`. No other API use.

### `/login` Login (`pages/Login.jsx`)

- **Today:** two workspace cards ("FSE Mobile App" → `/fse/mobile`, "Admin / Manager" → `/fse`); left hero shows
  `merchants[0]` from demoData (name, QR ring, priority, competitor) and hard-coded facts ("+19% observed uplift",
  "94/100", "43m").
- **Feed:** `listFse()`; hero card from `listMerchants()` (pick the lowest `latest_score`) or `getFseSummary(id).next_best`.
- **Actions:** see "Current rep and role" above. The FSE card becomes a list of reps (`name`, `territory`).
- **Copy fixes:** "+19% Observed uplift" → use `getPortfolioImpact().overall_avg_change_pct` labelled "Avg observed
  change" or drop it; "Multi-signal 94/100" → "combined evidence signals"; "75+ score that auto-pays" is wrong: the
  backend grants a ₹50 incentive for a verified **compliant** visit (QR ≥ 70 plus the other checks); say "Compliant
  visits earn ₹50".

### `/fse` Operations dashboard (`pages/Fse.jsx`)

Today it is an FSE-centric dashboard inside the manager sidebar layout ("Good morning, {first}"). It loads 8 legacy
functions in one `Promise.all` and shows an error card if any fails.

| Widget | Today | Feed | Map |
| --- | --- | --- | --- |
| Greeting + profile | `getProfile()` demo | `getCurrentFse()` / `listFse()` | `name`, `territory` |
| 4 KPI StatCards | demo `kpis` | `getFseSummary(fseId, pos)` + `getFseQueue` | Assigned = `coverage.assigned`; Visited 30d = `coverage.visited` (`coverage_pct`%); Still to visit today = queue length; Verified = `performance.verified_pct`% |
| Field Coverage map (Leaflet, OSM) | demo `mapPoints` (no lat/lng, so the map is empty today) | `listMerchants()` filtered by `assigned_fse_id`, `getFseQueue` | pin = merchant `lat/lng`; tier `done` if not in today's queue, else `priorityLevel(priority)`; popup = `name`, `address`, queue `reasons[]`. Default center should be the FSE `home_lat/home_lng` (Pune), not Bangalore `DEFAULT_CENTER` |
| Next Best Visit card | `merchants[0]` demo | `getFseSummary().next_best` | `name`, `distance_m` → km (null without position), `days_since_visit`, `latest_score` → ScoreRing, `reasons[]` → "why" list, `priority` → badge. Competitor/recommended action: not in queue payload (see gaps) |
| AI Priority Queue table | `getMerchants()` | `getFseQueue` (top 5) | `name`, `priorityLevel(priority)`, `distance_m`, `latest_score`; "Trend" column has no data: replace with `days_since_visit` |
| Visit Activity timeline | demo `activity` | `listVisits({fseId, limit: 6})` | `fmtTime(received_at)`, `STATUS_LABEL[status]` / `DECISION_LABEL[decision]`, `merchant_name`, click → `/visits/{id}` |
| Merchant Health graph | demo (object, so the graph is empty today) | `getFseVisits(fseId, 30)` | line of `qr_visibility_score` by `received_at`; optionally `authenticity_score` as a second line |
| AI Alerts | demo `alerts` | `listEscalations('open')` filtered to this FSE's `fse_name`, plus the queue's "Open issue: …" reasons | `reason`, `merchant_name`, `fmtTime(created_at)`; severity: authenticity < 70 → HIGH |
| 4 mini cards | demo `mini` ("18.4 km distance") | `getFseSummary().performance`, `listIncentives(fseId)`, `getDashboard().kpis.avg_observed_change_pct` | Avg authenticity, Conversions, Incentives earned `total_inr` (or `performance.incentives_inr`, 30 d), Avg observed change. Drop "Distance today" (no data) |
| Buttons | START VISIT → `/visits/SP-10482`, VIEW MERCHANT → `/merchants/m1`, View all → `/fse/queue` | | see the ID table |

Add an FSE selector (this page sits in the manager panel) and pass the device position if available.

### `/fse/mobile` FSE mobile app (`pages/FseMobile.jsx`): the core demo loop

Today it is a **simulated phone frame** on a desktop page with six static screens (M1 Login, M2 Home, M3 Queue,
M4 Merchant, M5 Audit, M6 Action). Only M3 iterates `merchants` from demoData; everything else is hard-coded text
("Aarav Sharma", "17 / 24", "38/100", "43m away", Hindi text, "₹50", "+19% observed uplift expected"). There is **no
camera, no upload, no API call**. "MARK INTERVENTION COMPLETE" only bumps a local counter.

Target: the real app a rep uses on a phone. Keep the frame on wide screens, but make the screens full-screen under ~600 px
(phones). Screens → endpoints:

| Screen | Feed / action | Field map |
| --- | --- | --- |
| M1 identity | `getCurrentFse()`; "switch rep" → `/login` | `name`, `territory`, id `FSE-{id}` |
| M2 home | `getFseSummary(fseId, pos)` | Coverage `visited / assigned` (`coverage_pct`), Conversions or Incentives `performance.incentives_inr`, Avg authenticity. Next best = `next_best` (`name`, `distance_m`, `reasons[]`, `latest_score`). "18.4 km travelled" → drop. Alerts → `next_best.reasons` / open escalations for this rep |
| M3 queue | `getFseQueue(fseId, pos)` | rank, `name`, `owner_name`, `fmtKm(distance_m)`, `priority` (rounded) + `priorityLevel`, `latest_score`, `reasons[]` (**show them all: this is the "priority queue reasons + distance" feature**), `days_since_visit`. Empty list → "All merchants visited today" |
| M4 merchant | `getMerchantDetail(id)` (+ `getMerchantImpact(id)` for a one-line "Observed change since last guidance") | `merchant.name/address/owner_name/language`, `context.summary`, `context.previous_issues[0]`, `latest_score`, `last_visit_at`, `consecutive_non_compliant`. Geofence line: distance from `geo.getCurrentPosition()` to `merchant.lat/lng` (haversine, client side; the backend radius is 100 m); "GPS unavailable" when null |
| M5 capture | **`createVisit({merchantId, fseId, lat, lng, photo, capturedAt: new Date() at capture, captureSource, analyze: true})`** then `pollVisit(id, {onUpdate})` while `analyzing` | Two buttons: "Take photo" = `<input type=file accept="image/*" capture="environment">` → `captureSource: 'camera'`; "Choose from gallery" → `'gallery'` (warn: costs 25 points and forces review). Preview with `URL.createObjectURL`. Show errors 413/415/422 from `err.detail`. While analyzing, animate `pipeline_log[]` (`STEP_LABEL[step]`, `summary`, `fmtTime(at)`) as the live journey |
| M5 results | the `VisitOut` | `visitPhotoUrl(v)`; `audit.qr_visibility_score`, `qr_obstructed`, `soundbox_visible`, `competitor` + `competitor_dominance`, `image_quality`, `confidence`×100 %; authenticity `score`/`verdict` + `signals[]` (`SIGNAL_LABEL`, `status`, `−penalty`, `detail`). Copy: "combined evidence signals" |
| M6 outcome | same `VisitOut`, branch on `status`/`decision` | `completed + compliant`: `actions.incentive.amount_inr` ("₹50 incentive approved"). `completed + non_compliant`: `actions.intervention` (`issue`, `message_text` in `message_language`, `message_text_en` as translation, **voice note player** on `audio_url`) + `actions.notifications[]` (**WhatsApp status** `NOTIFICATION_LABEL[status]`, `to_phone`, `error`). `escalated`: "Sent to manager for review" + `actions.escalation.reason`. `blocked`: "Blocked" + failing signals (e.g. reused photo). `failed`: error step summary + "Retry" → `startVisitAnalysis(id)` then poll. Replace "MARK INTERVENTION COMPLETE" (no such endpoint; the pipeline already completed the visit) with "Next merchant" → M3 (refetch queue) and "Open full audit" → `/visits/{id}` |
| Voice assistant (new, floating mic on M2-M4) | record with `MediaRecorder` (webm) → `askVoiceAudio`; on 503 (no Sarvam key) or when `getUserMedia` is unavailable (insecure context) fall back to a text box → `askVoiceText({fseId, text, language: 'hi-IN', merchantId: <open merchant>, lat, lng})` | show `transcript`, `answer_local` (and `answer_en` if different), `intent`; auto-play `mediaUrl(audio_url)` when present. Suggested chips: "aaj kaha jana hai?" (todays_visits), "is merchant ka problem kya hai?" (merchant_issue) |

Bottom nav "Manager" → `/manager` is fine (demo convenience).

### `/queue` and `/fse/queue` Priority queue (`pages/PriorityQueue.jsx`)

- **Today:** all demo `merchants`: filters (All/Critical/High/Medium/Low/Transaction Decline/Competitor Risk/Distance),
  search, rows with badge, location, km, "last visit", AI reasons, recommended action, "SightPay score" ring, a fake
  grid map with positioned pins, a banner ("5 merchants…", "2 urgent", "1.2 km"), and an "Explain Score" modal
  with **invented weights** (QR 30 %, trend 25 %, …).
- **Feed:** `getFseQueue(fseId, pos)`; `listFse()` for a rep selector; `getCurrentPosition()` for distance.
- **Map:** rank; `name`; `owner_name`; `fmtKm(distance_m)`; `days_since_visit` ("never" for null); `reasons[]`;
  `priority` (the ring shows the number, not /100: it can exceed 100); `latest_score`, `latest_decision`.
  Filters: High/Medium/Low via `priorityLevel`; "Open issue" = `latest_decision` in (non_compliant, low_confidence);
  "Never visited" = `days_since_visit == null`; "Nearby" = `distance_m <= 2000` (only with a position). Drop
  "Transaction Decline" unless a reason string starts with "Transactions" (the backend adds one when week-on-week
  sales fell > 10 %) and "Competitor Risk" unless a reason contains "Competitor".
- **Explain score modal:** replace the weights with the real formula from the contract: 100 − last QR score (60 if
  never audited) + 2/day since visit (max 30 days; 60 if never) + 20 open issue + 15 if transactions fell > 10 % w/w −
  5/km (max 30).
- **Map panel:** a real Leaflet map (reuse the approach from `Fse.jsx`, but in this file or a new component) with queue
  pins at `lat/lng` and the rep position.
- **Buttons:** START VISIT → `/fse/mobile?merchant={merchant_id}`; VIEW 360 → `/merchants/{merchant_id}`.

### `/merchants/:id` Merchant 360 (`pages/MerchantDetail.jsx`)

- **Today:** `getMerchant/getMerchantImpact/getMerchantMemory` (now real + shims; `impact` is fetched but unused), and
  most content is hard-coded: health cards (QR, "Soundbox 82/100", trend, competitor), a static 3-line SVG chart,
  an "AI Executive Summary" ("estimated to yield an observed transaction uplift of **+19%**", "93% confidence"), a
  fake memory graph (3 visits, PhonePe HIGH, "+19% Expected"), a hard-coded visit history table (`SP-10482`…), and a
  "Next action" banner. No `.catch`: a failed load hangs on "Loading…".
- **Feed:** `getMerchantDetail(id)`, `getMerchantImpact(id)` (and `?intervention_id=` for a chosen row),
  `listTransactions(id, 60)` for a longer sales line, `getVisitAudit(recent_visits[0].id)` for the latest
  competitor/soundbox (the detail payload does not carry audit fields).
- **Map:**
  - Header: `merchant.name`, `address`, `category`, `owner_name`, `phone`, `language`, `assigned_fse_name`.
  - Stat cards: QR = `merchant.latest_score`; Soundbox = latest audit `soundbox_visible` (yes/no, **not** a /100
    score); **"Observed change"** = `context.transaction_trend_pct` (never "trend"/"uplift"); Competitor = latest
    audit `competitor` + `competitor_dominance`.
  - **Before/after chart (new, replaces the static SVG):** `impact.series[]` (`date`, `amount_inr`, `phase`
    baseline|intervention|post): shade baseline vs post, mark the intervention day, show `impact.baseline_avg_daily_inr`
    vs `post_avg_daily_inr`, `change_pct`, and **the `caveat` text under the chart**. `status: insufficient_data` →
    "Not enough data yet (n days after)". `newer_intervention_pending` → banner "New guidance sent {date}, still
    collecting data". `intervention: null` → "No guidance sent to this merchant yet".
  - AI summary: `context.summary` (+ `context.source` chip: sql | cognee | sql_fallback → "Memory: Cognee" etc.).
    Remove the invented "+19%" and "93%" numbers.
  - Memory graph nodes: Visits = `recent_visits.length` + `last_visit_at`; Issues = `previous_issues[0]`;
    Interventions = `interventions[0].issue` + `message_language`; Scores = `previous_scores[]` (sparkline);
    Outcome = `transaction_trend_pct` as observed change. Memory stream = `interventions[]` (`fmtDate(created_at)`,
    `issue`, `message_text`, voice note player on `audio_url`).
  - Visit history table: `recent_visits[]` → `id`, `fmtDate(received_at)`, `fse_name`, `qr_visibility_score`,
    `authenticity_score`, `STATUS_LABEL[status]`, `DECISION_LABEL[decision]`; row → `/visits/{id}`.
  - `open_escalations[]` → a warning strip linking to `/manager`.
- **Buttons:** "Start Visit / Audit" → `/fse/mobile?merchant={id}`; "Execute Recommended Action" has no backend action
  (guidance is sent automatically by the pipeline): turn it into "Open latest visit" → `/visits/{recent_visits[0].id}`.

### `/visits/:id` and `/fse/visits/:id` Visit audit & evidence (`pages/VisitAudit.jsx`)

- **Today:** `getVisit(id)` + `analyzeVisit(id)` (now real VisitOut + shim keys). Hard-coded: the 4-row "rubric"
  checklist and its score (`SCORE` = 60), "Vision Confidence 93%", "43m (Passed)", "PhonePe HIGH", the decision bar
  ("Intervention Required: Reposition Paytm QR"), "Authenticity 94", the 5-step pipeline strip, "Language: Hindi",
  "FSE Aarav Sharma". "Re-run Vision AI" calls analyze (409 for a completed visit); "Execute Intervention", "Play Voice
  Preview" and "Send WhatsApp Nudge" only show toasts. A load failure leaves it on "Loading…".
- **Feed:** `getVisitDetail(id)` (one call has everything); `pollVisit` while `analyzing`.
- **Map:**
  - Header: `merchant_name` (link `/merchants/{merchant_id}`), `fmtDate/fmtTime(received_at)`, `fse_name`,
    `STATUS_LABEL[status]`, `capture_source`, `pipeline_mode`.
  - Verification chips: one per `authenticity.signals[]` (`SIGNAL_LABEL[signal]`, `status`, `detail`); the
    authenticity chip = `score` + `verdict`.
  - Photo: `<img src={visitPhotoUrl(v)}>`, placeholder when null. Chip "Photo reuse: unique/REUSED" from the
    `duplicate_image` signal.
  - Score ring: `audit.qr_visibility_score`. Replace the invented 4-row rubric with the real audit booleans:
    Paytm QR visible (`paytm_qr_visible`), QR not obstructed (`!qr_obstructed`), Soundbox visible (`soundbox_visible`),
    Competitor dominance (`competitor` + `competitor_dominance` low|medium|high), Image quality (`image_quality`,
    `blur_score`), `suspicious_signals[]`, `notes`, `provider`.
  - Stats: Vision confidence = `audit.confidence`×100 %; GPS = `gps` signal `detail`.
  - Decision bar: `DECISION_LABEL[decision]` + `decision_reasons[]` + `ACTION_LABEL[audit.recommended_action]`.
  - Evidence chain: `pipeline_log[]` (`fmtTime(at)`, `STEP_LABEL[step]`, `summary`), including `manager_review` and
    `whatsapp_status` steps.
  - **Authenticity / fraud breakdown:** `authenticity.signals[]` as a table (signal, pass/warn/fail, −penalty,
    detail) with 100 − Σpenalty = score and the thresholds (≥ 70 VERIFIED, 30-69 review, < 30 or reused photo
    BLOCKED). Copy: "combined evidence signals".
  - Guidance card: `actions.intervention` (`issue`, `message_text`, `message_language`, `message_text_en`) + **voice
    note player** (`<audio src={mediaUrl(audio_url)}>`, hidden when null) + **WhatsApp status** per
    `actions.notifications[]` (`NOTIFICATION_LABEL[status]`, `to_phone`, `error`, `fmtTime(created_at)`).
  - Incentive: `actions.incentive` (`amount_inr`, `status`, `reason`). Escalation: `actions.escalation` (`reason`,
    `status`, `resolved_by`, `note`).
- **Buttons:** "Re-run Vision AI" → show only when `status` is `submitted` or `failed` (label "Analyze"/"Retry
  analysis") → `startVisitAnalysis(id)` then `pollVisit`; show `err.detail` on 409. "Execute Intervention" and "Send
  WhatsApp Nudge" have **no endpoint** (the pipeline already sent it): remove them or show the sent status. "Play
  voice" → the `audio_url` player; when null, optionally `textToSpeech(message_text, message_language)` (503 without a
  key: say "Voice needs a Sarvam key").

### `/audits/:id` and `/fse/audits` AI audit (`pages/AIAudit.jsx`)

- **Today:** its own `fetch(${VITE_API_BASE_URL}/visits/{id}/audit)`: that endpoint does not exist and there is no
  `/api` prefix, so it always shows "Audit unavailable". `/fse/audits` has no id, so it says "No audit ID". It expects an
  invented shape (`visibility_score`, `qr_near_billing`, `paytm_dominance`, `evidence.*`, `execution.*`,
  `captured_image_url`) and has a "copy JSON payload" button.
- **Feed:** `getVisitDetail(id)` (audit + photo + authenticity + pipeline in one call; `getVisitAudit(id)` is the
  audit alone). For `/fse/audits` without an id: a list from `listVisits({limit: 20})` (or `listFlaggedVisits()`),
  each row → `/audits/{id}`. Delete `fetchAudit` and `VITE_API_BASE_URL`.
- **Map:** `score`/`qrVisibility` → `audit.qr_visibility_score`; `confidence` → `audit.confidence`×100;
  `soundboxVisible` → `soundbox_visible` (drop `soundboxPresent`: only visibility is known); `competitor` →
  `audit.competitor`/`competitor_dominance`; `paytmDominance` → derive `competitor_dominance === 'low' ||
  !competitor`; `qrNearBilling` has **no backend field**: use `!qr_obstructed && paytm_qr_visible` labelled "QR
  clearly visible", or drop the row; `recommendation` → `ACTION_LABEL[recommended_action]`; image → `visitPhotoUrl`;
  evidence rows → `authenticity.signals[]` (gps, timestamp, exif, live_capture, duplicate_image);
  `merchantMatch` → the gps signal; execution → `decision` + `pipeline_log` steps (guidance engine is in the
  `guidance` step summary, "template" / "sarvam" / "sarvam_tts"; n8n vs inline is `pipeline_mode`).
- **Optional "try it" panel:** upload a photo → `analyzeImage(photo)` → show `quality` + `audit` without storing
  anything.
- Overlaps heavily with VisitAudit: the same group owns both. Consider making AIAudit the "vision details" tab of the
  visit and `/fse/audits` the list.

### `/manager` Manager command center (`pages/Manager.jsx`)

- **Today:** demo `managerKpis` (6 tiles), demo `mapPoints` on a fake radar, demo `exceptions` (3), demo
  `fsePerformance` table, a static "System Architecture & Automation Health" (5 systems, "100% uptime"), and a review
  drawer with a note box and Reject / Approve / "Escalate to Regional" (approve/reject call the service with the demo
  id `SP-10482`: now a real call that would 422; escalate does nothing).
- **Feed:** `getDashboard()`, `listEscalations('open')`, `listFlaggedVisits()`, `getSystemHealth()`,
  `getVisitDetail(visit_id)` for the drawer.
- **Map:**
  - KPI tiles: `visits_today`, `visits_7d`, `compliance_rate_7d`%, `avg_authenticity_7d`, `blocked_7d` (warn),
    `open_escalations` (warn), `incentives_inr_7d` ₹, `whatsapp_sent_7d`, **`avg_observed_change_pct` labelled "Avg
    observed change"**. Optional `decision_breakdown_7d` as a small bar.
  - Map: `recent_visits[]` pins at `lat/lng`, coloured by `status`/`decision` (completed + compliant = done,
    escalated/low_confidence = pending, blocked/fraud = high). Use a real Leaflet map.
  - Exceptions list = open escalations: `merchant_name`, `fse_name`, `reason`, `authenticity_score`,
    `qr_visibility_score`, `confidence`×100 %, thumbnail `mediaUrl(photo_url)`; second section "Blocked visits" from
    `listFlaggedVisits()` with `verdict === 'BLOCKED'` (read-only, link `/visits/{id}`).
  - Drawer (**escalation approve/reject**): evidence = the visit's `authenticity.signals[]`, `audit` fields,
    `pipeline_log`, the photo. Buttons: Approve → `approveEscalation(e.id, {note, resolvedBy: getManagerName()})`,
    Reject → `rejectEscalation(...)`; then refetch the list and the dashboard. Show the outcome: for an unusable
    photo (`audit.recommended_action === 'retake_photo'`) approval means "approved, no action"; otherwise refetch
    the visit and show the applied `decision` (incentive or guidance + WhatsApp). 409 → "Already resolved". **Remove
    "Escalate to Regional"** (no endpoint) or disable it with a tooltip.
  - FSE table = `fse_leaderboard[]`: `name`, `territory`, `visits_7d`, `compliant_7d`, `verified_pct_7d` (null → "—"),
    `incentives_inr_7d`. Optionally per-rep `getFseSummary(id).coverage.coverage_pct` for a coverage column.
  - System health = `getSystemHealth()`: Vision (`vision_provider`: fixture/claude…), Anthropic key, n8n (on/off →
    inline), Memory (`sql`/`cognee`), WhatsApp (`dry_run`/`twilio`). Show the real state, not "100% uptime".
- Header dropdowns "Today" / "Region: Mumbai Zone": the data is 7-day and Pune; relabel "Last 7 days" and drop region.

### `/analytics` and `/fse/impact` Impact analytics (`pages/Analytics.jsx`)

- **Today:** `getImpact()` (now `/analytics/impact` + a legacy `kpis`/`interventions` mapping; `beforeAfter`/`trend`
  empty, so the charts show "No measurement data"). The page expects `kpis[i][1]`, `beforeAfter{labels, baseline,
  observed}`, `interventions[[name, …, change]]`, `trend[]`, `insight`, `merchant.name`. Has a range dropdown
  (7/14/30 days, slices `trend`), a methodology panel ("Observed change, not causal attribution": good), a pending
  outcomes drawer (static).
- **Feed:** `getPortfolioImpact()`, `getDashboard()`, `getMerchantImpact(merchant_id)` for the selected merchant.
- **Map:**
  - KPIs: Merchants measured = `merchants_measured`; **Avg observed change** = `overall_avg_change_pct`; Merchants
    with positive observed change = count of `merchants[].change_pct > 0`; Avg QR score 7d =
    `dashboard.kpis.avg_qr_score_7d`; Visits 7d = `dashboard.kpis.visits_7d`. Drop "Successful interventions: 87",
    "QR visibility improvement +26 pts", "Merchants recovered" (no data) unless derived as above.
  - Intervention performance table = `by_action` entries: `ACTION_LABEL`/`label`, `merchants`, `avg_change_pct`.
  - Merchant leaderboard = `merchants[]` (`merchant_name`, `ACTION_LABEL[action]`, `fmtDate(intervention_date)`,
    `fmtPct(change_pct)`); selecting one loads `getMerchantImpact(merchant_id)` for the **before/after chart**
    (`series[]` by `phase`, averages, `caveat` under the chart).
  - `insight` → `caveat` (always visible). Range dropdown: remove, or use it to request `listTransactions(id, days)`
    for the selected merchant.
  - Pending drawer: for the selected merchant, `newer_intervention_pending` ("New guidance sent {date}, still
    collecting data"); across merchants there is no endpoint (see gaps).

### Shared chrome

- `components/Layout.jsx`: sidebar links (fixed: Merchant 360 → `/fse/merchants`, Visit Audit → `/fse/visits`, both
  redirect to real ids); profile from `demoData.fse` → session (`getCurrentFse()` / manager name); topbar search box is
  inert (could filter `listMerchants()` client-side and jump to `/merchants/{id}`); bell → open escalations count.
  NavLink for Merchant 360 / Visit Audit will not highlight on `/merchants/5` or `/visits/50`; use a custom
  `className` callback on `useLocation().pathname` if it matters.
- `components/ui.jsx`: `PriorityTable` reads `m.pri/km/qr/trend`; `ActivityTimeline` and `AlertCard` read the demo
  shapes; `MapView` and `TransactionChart` are demo-shaped and unused by the routed pages. Owned by group C.
- `pages/Pages.jsx`: not imported anywhere (dead code with `m1`/`SP-10482` redirects). Delete it.

---

## 4. Gaps

### UI widgets without backend data

| Widget (page) | Proposal |
| --- | --- |
| Soundbox "/100 score" (MerchantDetail, FseMobile M4/M5) | only `soundbox_visible` (bool) exists: show Visible / Not visible |
| Competitor on queue rows / next-best card / merchant header | not in queue or merchant payloads: take it from the latest visit's audit (`getVisitAudit(latest_visit_id)`) on detail pages; on lists show the queue `reasons[]` instead (they include "Open issue: Competitor QR dominance") |
| Recommended action on queue rows | derive from `reasons[]` ("Open issue: X" → X) or the latest audit's `recommended_action` |
| "Trend" column / "Transaction decline" filter (queue, Fse table) | no week-on-week trend in the queue; the backend only adds a reason when sales fell > 10 %. Replace the column with `days_since_visit`; the filter matches that reason |
| "QR near billing", "Paytm dominance" (AIAudit) | no fields: derive from `qr_obstructed`/`paytm_qr_visible` and `competitor_dominance`, or drop |
| Distance travelled today ("18.4 km") | no GPS track: drop |
| "Successful interventions 87", "QR visibility improvement +26 pts", "Merchants recovered 31" (Analytics) | derive from `/analytics/impact` as listed, or hide |
| "Estimated +19% uplift", "93% confidence" (MerchantDetail summary, FseMobile M6, Login) | remove: invented and causal. Use `transaction_trend_pct` labelled "Observed change" + caveat |
| Priority "Explain Score" weights (PriorityQueue) | replace with the contract's formula |
| "Execute Intervention", "Send WhatsApp Nudge", "Mark intervention complete", "Escalate to Regional" | no endpoints: the pipeline performs these automatically. Remove, or turn into links/status displays |
| System uptime (Manager) | `GET /health` shows which providers are configured, not uptime: show configured state |
| Region / date-range filters (Manager, Fse, PriorityQueue, Analytics) | backend windows are fixed (today, 7 d, 30 d): relabel |
| Merchant "memory graph" nodes | build from `context` + `interventions[]` + `recent_visits[]` (see MerchantDetail) |
| Portfolio "pending outcomes" list | no endpoint; per merchant use `newer_intervention_pending`. Across merchants: optional backend addition later |
| Topbar search, notifications bell | client-side over `listMerchants()` / `listEscalations('open')` |

### Backend features without UI yet (and where they go)

| Feature | Endpoint(s) | Page (group) |
| --- | --- | --- |
| Real capture → analyze → live pipeline journey → outcome | `createVisit`, `pollVisit`, `startVisitAnalysis` | FseMobile M5/M6 (A) |
| Voice assistant: record → query → play | `askVoiceAudio`, `askVoiceText`, `textToSpeech` | FseMobile floating mic (A) |
| Priority queue reasons + distance (with device GPS) | `getFseQueue(fseId, {lat, lng})` | FseMobile M3 (A), PriorityQueue (C) |
| Coverage / performance | `getFseSummary` | FseMobile M2 (A), Fse dashboard (C), Manager FSE table (D) |
| Incentives earned | `listIncentives(fseId)` | FseMobile M2/M6 (A), Fse mini cards (C) |
| Merchant impact before/after chart with the observed-change caveat | `getMerchantImpact` | MerchantDetail (C), Analytics (D) |
| Merchant memory (summary, source, previous issues/scores/interventions) | `getMerchantDetail().context` | MerchantDetail (C), FseMobile M4 (A) |
| Transaction history | `listTransactions` | MerchantDetail (C) |
| WhatsApp notification status + voice note player | `VisitOut.actions.notifications[]`, `intervention.audio_url` | VisitAudit (B), FseMobile M6 (A), MerchantDetail interventions (C) |
| Fraud / authenticity breakdown | `VisitOut.authenticity`, `getVisitFraud`, `listFlaggedVisits` | VisitAudit + AIAudit (B), Manager blocked list (D) |
| Escalation approve / reject with outcome | `listEscalations`, `approveEscalation`, `rejectEscalation` | Manager (D) |
| Rep visit map | `getFseVisits(fseId, days)` | Fse dashboard map/health (C); optionally a map on FseMobile M2 (A) |
| Portfolio impact by action / by merchant | `getPortfolioImpact` | Analytics (D), Manager KPI (D) |
| Provider status | `getSystemHealth` | Manager (D), optionally Landing (D) |
| Stateless image try-it | `analyzeImage` | AIAudit (B), optional |

---

## 5. Parallel work split (disjoint files)

Rules for every group: do **not** edit `src/services/*` (if a function is missing or wrong, note it in the hand-off;
the services are complete for every route), `vite.config.js`, or another group's files. New components go in the
group's own folder under `src/components/<group>/`. When your pages no longer import a legacy name or `demoData`,
say so; **deleting `demoData.js` and `services/legacy.js` is a final cleanup step after all groups finish** (whoever
integrates). Use `format.js` for labels/dates, `mediaUrl()` for every photo/audio URL, and show `err.detail` from
`ApiError` in the UI (no silent fallbacks).

### Group A: FSE mobile app (the core demo loop)

- Files: `src/pages/FseMobile.jsx`, new `src/components/mobile/*` (e.g. `CameraCapture.jsx`, `PipelineJourney.jsx`,
  `VoiceAssistant.jsx`, `AudioPlayer.jsx`, `VisitOutcome.jsx`).
- Scope: responsive full-screen on phones; screens M1-M6 on real data; capture + upload + poll + outcome; voice
  assistant; honour `?merchant=<id>` in the URL (open M4 for that merchant) since other pages will link to
  `/fse/mobile?merchant=<id>`.
- Services: `session.getCurrentFse/getCurrentFseId`, `geo.getCurrentPosition`, `fse.getFseSummary`,
  `fse.getFseQueue`, `merchants.getMerchantDetail`, `merchants.getMerchantImpact` (one line), `visits.createVisit`,
  `visits.pollVisit`, `visits.startVisitAnalysis`, `visits.visitPhotoUrl`, `voice.askVoiceAudio`,
  `voice.askVoiceText`, `voice.textToSpeech`, `incentives.listIncentives`, `api.mediaUrl`, `format.*`.

### Group B: Visit evidence (audit + authenticity)

- Files: `src/pages/VisitAudit.jsx`, `src/pages/AIAudit.jsx`, new `src/components/visit/*` (e.g. `EvidenceSignals.jsx`,
  `PipelineTimeline.jsx`, `GuidanceCard.jsx` with WhatsApp status + voice note).
- Scope: both visit pages on `VisitOut`; `/fse/audits` list; retry/analyze with polling; remove fake actions.
- Services: `visits.getVisitDetail`, `visits.startVisitAnalysis`, `visits.pollVisit`, `visits.listVisits`,
  `visits.visitPhotoUrl`, `fraud.getVisitFraud`, `fraud.listFlaggedVisits`, `audits.getVisitAudit`,
  `audits.analyzeImage`, `voice.textToSpeech`, `api.mediaUrl`, `format.*`.

### Group C: Rep desk (ops dashboard, queue, merchant 360)

- Files: `src/pages/Fse.jsx`, `src/pages/PriorityQueue.jsx`, `src/pages/MerchantDetail.jsx`,
  `src/components/ui.jsx`, new `src/components/rep/*` (e.g. `ImpactChart.jsx` for the before/after chart,
  `FseSelect.jsx`, `QueueMap.jsx`).
- Scope: everything in the Fse, PriorityQueue, MerchantDetail sections above, incl. an FSE selector, real maps, the
  merchant impact chart with caveat, the real priority formula, and ID fixes.
- Services: `session.*`, `geo.getCurrentPosition`, `fse.listFse`, `fse.getFseQueue`, `fse.getFseSummary`,
  `fse.getFseVisits`, `merchants.listMerchants`, `merchants.getMerchantDetail`, `merchants.getMerchantImpact`,
  `transactions.listTransactions`, `visits.listVisits`, `audits.getVisitAudit`, `escalations.listEscalations`,
  `incentives.listIncentives`, `analytics.getDashboard`, `api.mediaUrl`, `format.*`.
- Note: group D may want the before/after chart on Analytics. To avoid a cross-group edit, group D builds its own
  chart (or copies C's once both are done); do not import across groups mid-flight.

### Group D: Manager, analytics, login and shell

- Files: `src/pages/Manager.jsx`, `src/pages/Analytics.jsx`, `src/pages/Login.jsx`, `src/pages/Landing.jsx`,
  `src/components/Layout.jsx`, `src/SightPayRoutes.jsx`, `src/components/Redirects.jsx`, delete `src/pages/Pages.jsx`,
  new `src/components/manager/*`.
- Scope: Login FSE/manager picker + session; Layout profile / log out / role-aware nav; Manager KPIs, map,
  escalation approve/reject drawer with outcome, leaderboard, provider health; Analytics on `/analytics/impact` +
  per-merchant before/after chart with caveat; Landing de-demo.
- Services: `session.*`, `fse.listFse`, `fse.getFseSummary` (optional coverage column), `analytics.getDashboard`,
  `analytics.getPortfolioImpact`, `analytics.getSystemHealth`, `escalations.listEscalations`,
  `escalations.approveEscalation`, `escalations.rejectEscalation`, `fraud.listFlaggedVisits`, `visits.getVisitDetail`,
  `merchants.getMerchantImpact`, `merchants.listMerchants`, `api.mediaUrl`, `format.*`.

---

## 6. Captured example payloads (fresh seed, fixture vision, no keys)

The contract's examples match the live server. Extra observations from this run:

- A compliant-looking generated photo with `VISION_PROVIDER=fixture` and an empty fixture map gets the
  `default: non_compliant` fixture (QR 38, PhonePe high): every new visit is non-compliant with guidance + a
  `dry_run` WhatsApp unless `backend/fixtures/vision_fixtures.json` registers the photo
  (`backend/scripts/register_fixture.py`). Uploading the same photo again yields `blocked`/`fraud`
  (`duplicate_image` fail). Plan demo photos accordingly.
- A camera capture with `captured_at` and GPS at the shop scores **90 VERIFIED** (−10 for no EXIF, as documented).
- `POST /voice/query` (text, no key): `answer_local == answer_en`, `audio_url: null`, intent `todays_visits` for
  "aaj kaha jana hai?" and `merchant_issue` for "is merchant ka problem kya hai?" with `merchant_id`.
- `POST /voice/query` with `audio` and `POST /voice/tts` → **503** `"… needs SARVAM_API_KEY"` without a key: the UI
  must fall back to text input / text output.
- `GET /fse/{id}/summary` without `lat/lng`: `next_best.distance_m` is `null`.
- `GET /escalations?status=open` after seeding: one row (Sai Dairy, `photo_url: null`, confidence 0.41).
- `GET /fraud/flagged` is empty after seeding; it fills after a duplicate upload.
- Error bodies: `{"detail": "Visit is already completed"}` (409), `{"detail": "Visit not found"}` (404), and 422
  validation as `{"detail": [{"loc": ["body", "fse_id"], "msg": "…"}]}`: `ApiError.detail` flattens it to
  `"fse_id: Input should be a valid integer…"`.
