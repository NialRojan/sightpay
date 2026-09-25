# SightPay API Contract (v1)

Base URL: `http://<backend-host>:8000/api` · JSON · snake_case · datetimes are naive UTC ISO-8601 · photos served from `photo_url`.
Interactive docs: `http://<backend-host>:8000/docs`.

**`photo_url` / `audio_url` are absolute URLs built from the backend's `PUBLIC_BASE_URL`.** The default
`http://localhost:8000` only works on the server machine itself. For a phone or another laptop, start the backend with
`PUBLIC_BASE_URL=http://<LAN-IP>:8000` (for example `http://192.168.1.20:8000`) in `backend/.env`. `photo_url` is
`null` for seeded historical visits (they have no photo); show a placeholder.

**`/api/internal/*` is for the n8n workflow only.** It needs the `X-Internal-Token` header and runs individual pipeline
steps. The frontend must never call it: use `POST /visits` and `POST /visits/{id}/analyze` instead.

All example responses below were captured with `curl` against a freshly seeded local server (`python -m app.seed`, `VISION_PROVIDER=fixture`). Long arrays are trimmed to 1-2 representative items; timestamps are real values from that run.

## Core demo loop

1. `POST /visits` (multipart/form-data)
   fields: `merchant_id` (int), `fse_id` (int), `lat`, `lng` (float, device GPS), `captured_at` (ISO, device clock),
   `capture_source` (`"camera"` | `"gallery"`), `analyze` (`"true"` to start analysis immediately), `photo` (jpeg/png/webp ≤ 10 MB)
   → 201 `VisitOut`. Without `analyze` the status is `"submitted"`. With `analyze=true` it can be:
   `"analyzing"` (n8n mode, poll it), or the final `"completed"`, `"escalated"`, `"blocked"` or `"failed"` (inline mode).
   errors: 404 unknown merchant/fse · 413 larger than 10 MB · 415 an image, but not JPEG/PNG/WebP · 422 not a readable image
   (the format is detected from the file bytes; the multipart `Content-Type` of the photo is ignored)
2. `POST /visits/{id}/analyze` → `VisitOut` · **409 if the status is not `submitted` or `failed`, or is a fresh `analyzing`**.
   A `failed` visit can be re-analyzed. So can a visit stuck in `analyzing` with no pipeline progress for over 120 s
   (for example n8n crashed mid-run): that recovery run always goes inline and is marked `pipeline_mode: "inline_recovery"`.
   Two taps on "Analyze" are safe: the backend claims the visit atomically, so the second call gets 409 and the pipeline runs once.
3. `GET /visits/{id}` → `VisitOut`. **Poll every 1s while status == "analyzing"** (n8n mode).
   Animate `pipeline_log[]` entries (`step`, `at`, `summary`) as the live journey:
   `queued → fraud_check → vision_ai → merchant_context → decision → incentive | guidance → whatsapp | escalation | block → complete`

Statuses: `submitted` (uploaded, not analyzed) · `analyzing` · `completed` (compliant or non-compliant, actions done) ·
`escalated` (low confidence, waiting for a manager) · `blocked` (failed authenticity, e.g. a reused photo) ·
`rejected` (a manager rejected the escalation; final) · `failed` (the pipeline crashed; the `error` step in
`pipeline_log` says why; retry with `POST /visits/{id}/analyze`).

### What the frontend must send (and why)

- **`capture_source=camera` for every in-app capture**, `gallery` only when the user picked an existing file.
- **`captured_at` = the device clock at the moment of capture** (ISO-8601 with timezone, e.g. `2026-09-24T20:18:20Z`).
  If you do not have one, **omit the field**. Never send an empty `captured_at=`: it is not part of the contract (today it
  is silently read as "no capture time", costing 10 points; stricter parsing would reject it with 422).

The authenticity score starts at 100 and each evidence signal subtracts a penalty. `VERIFIED` needs ≥ 70;
30-69 is `REVIEW_REQUIRED` (the visit is escalated to a manager); < 30 or a reused photo is `BLOCKED`.
Browser camera captures usually carry no EXIF, which always costs 10, so a perfect in-app visit scores **90**.

| Signal | Pass | Penalty otherwise |
| --- | --- | --- |
| `live_capture` | `camera`: 0 | `gallery`: 25 · missing/unknown: 10 |
| `timestamp` | `captured_at` within 10 min of upload: 0 | missing: 10 · 10-60 min: 15 · over 60 min: 30 |
| `exif` | consistent EXIF: 0 | no EXIF: 10 |
| `gps` | within `GPS_RADIUS_M` of the shop: 0 | up to 3× radius: 20 · further: 45 |
| `duplicate_image` | unique: 0 | reused photo: always `BLOCKED` |

So: camera + `captured_at` = 90. Forgetting both costs another 20 (70, one GPS wobble away from review).
A gallery pick is 100 − 10 − 25 = 65, which is `REVIEW_REQUIRED` even at the shop.

### VisitOut

`id, merchant_id, merchant_name, fse_id, fse_name, status (submitted|analyzing|completed|escalated|blocked|rejected|failed),
decision (compliant|non_compliant|low_confidence|fraud|null), decision_reasons[], photo_url (null for seeded visits), lat, lng, captured_at,
received_at, capture_source, pipeline_mode (n8n|inline|inline_fallback|inline_recovery), pipeline_log[], completed_at,
authenticity {score 0-100, verdict VERIFIED|REVIEW_REQUIRED|BLOCKED, signals[{signal, status pass|warn|fail, penalty, detail}]},
audit {paytm_qr_visible, qr_visibility_score, soundbox_visible, competitor, competitor_dominance, qr_obstructed,
       image_quality ok|blurry|dark, blur_score, suspicious_signals[], recommended_action, confidence, notes, provider},
actions {incentive, intervention {message_text, message_text_en, message_language, audio_url}, escalation, notifications[]}`

UI copy rule: authenticity is "combined evidence signals", never "EXIF-verified".

Guidance, WhatsApp and memory details:
- **`actions.intervention`**: `message_text_en` is the English diagnosis, `message_text` is what the merchant receives in
  `message_language`. With `SARVAM_API_KEY` set, `message_text` is a Sarvam translation and `audio_url` is a Sarvam voice
  note (`.mp3`, which WhatsApp and browsers both play). Without a key, or when Sarvam fails, `message_text` is the curated Hindi/Marathi template and `audio_url`
  is `null`. A Sarvam failure never fails the visit.
- **`guidance` step summary** is `"{engine}: {issue} guidance in {language}"`, followed by `" with voice note"` when
  `audio_url` is set. `engine` is `sarvam` (translated + voiced), `sarvam_tts` (template text, voiced) or `template`
  (no Sarvam). `data.text` is the text that was sent.
- **`actions.notifications[].status`** is `dry_run` | `sent` | `delivered` | `read` | `failed` | `undelivered`. `sent`
  only means Twilio accepted the message; `delivered`, `read` and `undelivered` (and a later `failed`) arrive afterwards
  from Twilio's status callback (see [Webhooks](#webhooks-twilio-facing)), which also sets `error` to
  `"Twilio <ErrorCode>: <ErrorMessage>"` and adds a `whatsapp_status` step (e.g. `"WhatsApp undelivered (Twilio 63015)"`).
  Without a public `PUBLIC_BASE_URL` no callback is requested and a Twilio message stays `sent`. Twilio is used only when `WHATSAPP_MODE=twilio`
  **and** both `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set; otherwise the message is logged as `dry_run`. A
  Twilio error is recorded as `failed` with `error` set (the visit still completes); `provider_ref` is the Twilio message
  SID when `sent`. `to_phone` is the number actually messaged: `WHATSAPP_DEMO_TO` when that is set, otherwise the
  merchant's phone. When redirected, the `whatsapp` step summary ends with `" (redirected to demo phone +91…1234)"`
  (first three and last four characters of `WHATSAPP_DEMO_TO`). The voice note goes as a second WhatsApp message right after the text
  (WhatsApp drops the caption of a voice note), and only when `audio_url` is on a public host (not `localhost` or a
  private/LAN IP, which Twilio cannot fetch); `audio_url` is stored on the notification either way. `provider_ref` and
  the delivery status track the text message; a failed voice note is noted in `error` (`voice note not sent: ...`) while
  the status stays `sent`.
- **Merchant memory `source`** (`merchant_context` step `data.source`, and `context.source` on `GET /merchants/{id}`)
  is `sql` (`MEMORY_BACKEND=sql`), `cognee` (the summary came from Cognee) or `sql_fallback` (`MEMORY_BACKEND=cognee`
  but Cognee errored, returned nothing, or took longer than `COGNEE_TIMEOUT_S`, so the SQL summary is used).

#### Example: `POST /visits` with `analyze=true` (compliant → incentive)

```bash
curl -F merchant_id=1 -F fse_id=1 -F lat=18.510189 -F lng=73.7982 -F capture_source=camera \
     -F captured_at=2026-09-24T20:18:20Z -F analyze=true \
     -F "photo=@demo_photos/counter_good.jpg;type=image/jpeg" http://localhost:8000/api/visits
```

```json
{
  "id": 50,
  "merchant_id": 1,
  "merchant_name": "Ramesh General Store",
  "fse_id": 1,
  "fse_name": "Amit Patil",
  "status": "completed",
  "decision": "compliant",
  "decision_reasons": [
    "Paytm QR clearly visible and Soundbox present",
    "Improved from previous score 42 to 89"
  ],
  "photo_url": "http://localhost:8000/media/visit_ac1714e408ec4414a560843d4d2c4b0d.jpg",
  "lat": 18.510189,
  "lng": 73.7982,
  "captured_at": "2026-09-24T20:18:21",
  "received_at": "2026-09-24T20:18:21.048841",
  "capture_source": "camera",
  "pipeline_mode": "inline",
  "pipeline_log": [
    {"step": "fraud_check", "at": "2026-09-24T20:18:21.053836", "summary": "Authenticity 90/100 VERIFIED"},
    {"step": "vision_ai", "at": "2026-09-24T20:18:21.061869", "summary": "QR visibility 89, confidence 0.93 (fixture)"},
    {"step": "merchant_context", "at": "2026-09-24T20:18:21.063852", "summary": "Ramesh General Store: last score 42 (2026-09-05); previous issue: QR obstruction; previous intervention: clear_qr_obstruction; 2 non-compliant visit(s) in a row.", "data": {"source": "sql"}},
    {"step": "decision", "at": "2026-09-24T20:18:21.064354", "summary": "compliant: Paytm QR clearly visible and Soundbox present; Improved from previous score 42 to 89"},
    {"step": "incentive", "at": "2026-09-24T20:18:21.065540", "summary": "₹50 incentive approved for Amit Patil"},
    {"step": "complete", "at": "2026-09-24T20:18:21.066374", "summary": "Visit completed"}
  ],
  "completed_at": "2026-09-24T20:18:21.066369",
  "authenticity": {
    "score": 90,
    "verdict": "VERIFIED",
    "signals": [
      {"signal": "gps", "status": "pass", "penalty": 0, "detail": "0 m from merchant (limit 100 m)"},
      {"signal": "duplicate_image", "status": "pass", "penalty": 0, "detail": "Unique among 0 previous photos"}
    ]
  },
  "audit": {
    "paytm_qr_visible": true,
    "qr_visibility_score": 89,
    "soundbox_visible": true,
    "competitor": "PhonePe",
    "competitor_dominance": "low",
    "qr_obstructed": false,
    "image_quality": "ok",
    "blur_score": 9951.9,
    "suspicious_signals": [],
    "recommended_action": "none",
    "confidence": 0.93,
    "notes": "Paytm QR clearly visible beside the billing counter; Soundbox on.",
    "provider": "fixture"
  },
  "actions": {
    "incentive": {"id": 18, "fse_id": 1, "merchant_id": 1, "visit_id": 50, "amount_inr": 50, "status": "approved", "reason": "Verified compliant visit"},
    "intervention": null,
    "escalation": null,
    "notifications": []
  }
}
```

Same photo submitted again as a fresh visit (fraud, duplicate image) yields `status: "blocked"`, `decision: "fraud"`, `authenticity.verdict: "BLOCKED"`, and a `duplicate_image` signal with `status: "fail"`. A blurry photo yields `status: "escalated"`, `decision: "low_confidence"` and populates `actions.escalation`.

#### Example: `GET /visits/{id}` (non-compliant → guidance + WhatsApp)

```json
{
  "id": 51,
  "merchant_id": 1,
  "merchant_name": "Ramesh General Store",
  "fse_id": 1,
  "fse_name": "Amit Patil",
  "status": "completed",
  "decision": "non_compliant",
  "decision_reasons": ["QR visibility 38 below 70", "Paytm QR obstructed"],
  "photo_url": "http://localhost:8000/media/visit_fcb86f82ede343169f5edbedf0886f70.jpg",
  "lat": 18.510189,
  "lng": 73.7982,
  "captured_at": "2026-09-24T20:18:27",
  "received_at": "2026-09-24T20:18:27.554022",
  "capture_source": "camera",
  "pipeline_mode": "inline",
  "pipeline_log": [
    {"step": "fraud_check", "at": "2026-09-24T20:18:27.556336", "summary": "Authenticity 90/100 VERIFIED"},
    {"step": "vision_ai", "at": "2026-09-24T20:18:27.563200", "summary": "QR visibility 38, confidence 0.93 (fixture)"},
    {"step": "decision", "at": "2026-09-24T20:18:27.565406", "summary": "non_compliant: QR visibility 38 below 70; Paytm QR obstructed"},
    {"step": "guidance", "at": "2026-09-24T20:18:27.566261", "summary": "template: QR poorly positioned guidance in hi-IN", "data": {"text": "नमस्ते Ramesh जी, Paytm QR को बिलिंग काउंटर के पास रखिए ताकि ग्राहकों को साफ़ दिखे।"}},
    {"step": "whatsapp", "at": "2026-09-24T20:18:27.609127", "summary": "WhatsApp dry_run to Ramesh Shinde"},
    {"step": "complete", "at": "2026-09-24T20:18:27.610018", "summary": "Visit completed"}
  ],
  "completed_at": "2026-09-24T20:18:27.610014",
  "authenticity": {
    "score": 90,
    "verdict": "VERIFIED",
    "signals": [
      {"signal": "gps", "status": "pass", "penalty": 0, "detail": "0 m from merchant (limit 100 m)"},
      {"signal": "duplicate_image", "status": "pass", "penalty": 0, "detail": "Unique among 1 previous photos"}
    ]
  },
  "audit": {
    "paytm_qr_visible": true,
    "qr_visibility_score": 38,
    "soundbox_visible": true,
    "competitor": "PhonePe",
    "competitor_dominance": "high",
    "qr_obstructed": true,
    "image_quality": "ok",
    "blur_score": 10057.5,
    "suspicious_signals": [],
    "recommended_action": "reposition_paytm_qr",
    "confidence": 0.93,
    "notes": "PhonePe standee dominates the counter; Paytm QR is partly behind the register.",
    "provider": "fixture"
  },
  "actions": {
    "incentive": null,
    "intervention": {
      "id": 32, "merchant_id": 1, "visit_id": 51, "action": "reposition_paytm_qr", "issue": "QR poorly positioned",
      "message_text_en": "Namaste Ramesh ji, please place the Paytm QR next to the billing counter so customers can see it clearly.",
      "message_text": "नमस्ते Ramesh जी, Paytm QR को बिलिंग काउंटर के पास रखिए ताकि ग्राहकों को साफ़ दिखे।",
      "message_language": "hi-IN", "audio_url": null
    },
    "escalation": null,
    "notifications": [
      {"id": 1, "channel": "whatsapp", "to_phone": "+919810000000", "body": "नमस्ते Ramesh जी, Paytm QR को बिलिंग काउंटर के पास रखिए ताकि ग्राहकों को साफ़ दिखे।", "audio_url": null, "status": "dry_run", "provider_ref": null, "error": null}
    ]
  }
}
```

## Merchants

- `GET /merchants` → `[{id, name, owner_name, language, lat, lng, category, assigned_fse_name, latest_score, latest_decision, last_visit_at}]`
- `GET /merchants/{id}` → `{merchant, context (memory: previous_scores, previous_issues, previous_interventions, consecutive_non_compliant, transaction_trend_pct, summary, source sql|cognee|sql_fallback), recent_visits[], interventions[], open_escalations[]}`
  `context.transaction_trend_pct` is the **observed** % change in daily transactions around the merchant's most recent
  **measurable** intervention (see [Impact](#impact-observed-change--never-label-as-causal-uplift)): a fresh intervention
  (fewer than 3 days of data after it) is skipped in favour of the previous one with `status: "ok"`. It is `null` only
  when none of the merchant's recent interventions is measurable, never an extrapolated value. While a visit is being
  analyzed, the intervention that visit itself created is ignored. When set, `summary` ends with
  `observed transaction change +x%`. Show it as "Observed change", never as uplift caused by the fix.
- `GET /merchants/{id}/impact?intervention_id=` → see [Impact](#impact-observed-change--never-label-as-causal-uplift)

#### Example: `GET /merchants/1`

```json
{
  "merchant": {
    "id": 1, "name": "Ramesh General Store", "owner_name": "Ramesh Shinde", "phone": "+919810000000",
    "language": "hi-IN", "lat": 18.510189, "lng": 73.7982, "address": "Kothrud, Pune", "category": "kirana",
    "assigned_fse_id": 1, "assigned_fse_name": "Amit Patil", "latest_score": 42, "latest_decision": "non_compliant",
    "last_visit_at": "2026-09-05T05:00:00"
  },
  "context": {
    "merchant_id": 1, "merchant_name": "Ramesh General Store", "rep_name": "Amit Patil",
    "previous_scores": [42, 38], "previous_issues": ["QR obstruction", "QR poorly positioned"],
    "previous_interventions": ["clear_qr_obstruction", "reposition_paytm_qr"], "consecutive_non_compliant": 2,
    "last_visit_at": "2026-09-05T05:00:00", "transaction_trend_pct": 17.5,
    "summary": "Ramesh General Store: last score 42 (2026-09-05); previous issue: QR obstruction; previous intervention: clear_qr_obstruction; 2 non-compliant visit(s) in a row; observed transaction change +17.5%.",
    "source": "sql", "extra": {}
  },
  "recent_visits": [
    {"id": 2, "merchant_id": 1, "merchant_name": "Ramesh General Store", "fse_id": 1, "fse_name": "Amit Patil", "status": "completed", "decision": "non_compliant", "qr_visibility_score": 42, "authenticity_score": 92, "lat": 18.510189, "lng": 73.7982, "received_at": "2026-09-05T05:00:00"},
    {"id": 1, "merchant_id": 1, "merchant_name": "Ramesh General Store", "fse_id": 1, "fse_name": "Amit Patil", "status": "completed", "decision": "non_compliant", "qr_visibility_score": 38, "authenticity_score": 96, "lat": 18.510189, "lng": 73.7982, "received_at": "2026-08-11T05:00:00"}
  ],
  "interventions": [
    {"id": 2, "merchant_id": 1, "visit_id": 2, "action": "clear_qr_obstruction", "issue": "QR obstruction", "message_text_en": "Guidance sent: QR obstruction", "message_text": "Guidance sent: QR obstruction", "message_language": "hi-IN", "audio_url": null, "created_at": "2026-09-05T05:00:00"}
  ],
  "open_escalations": []
}
```

## Impact (observed change — never label as causal uplift)

Every impact response carries `label: "observed_change"` and this `caveat`: "Observed change around the intervention
date. This is not proof that the intervention caused it: seasonality, festivals and other factors also move sales."
**UI: show `caveat` under the chart; say "Observed change", never "uplift caused by".**

Windows: baseline = the 14 days strictly before the intervention date, post = up to 14 days strictly after it; the
intervention day itself is excluded. If either window has fewer than 3 days of data (or the baseline average is 0),
`status` is `insufficient_data` and `change_inr`/`change_pct` are `null`: never extrapolated. INR is rounded to 2
decimals, percentages to 1.

- `GET /merchants/{id}/impact?intervention_id=` → `{merchant_id, merchant_name, label, caveat,
  intervention {id, action, issue, date, visit_id, message_text} | null,
  newer_intervention_pending {id, action, issue, date, visit_id} | null,
  impact {intervention_date, baseline_start, baseline_end, post_start, post_end, baseline_days, post_days,
  baseline_avg_daily_inr, post_avg_daily_inr, change_inr, change_pct, baseline_avg_txn_count, post_avg_txn_count,
  status ok|insufficient_data, label, caveat} | null, series [{date, amount_inr, txn_count, phase baseline|intervention|post}]}`
  Without `intervention_id` it measures the merchant's most recent **measurable** intervention (`status: "ok"`, looking
  back at most 5 interventions, newest first); `intervention` is always the one actually measured. If a newer
  intervention is still collecting post data, it is returned in `newer_intervention_pending` (UI: "New guidance sent
  <date>, still collecting data"); otherwise that field is `null`. If no recent intervention is measurable, the latest
  one is shown with `status: "insufficient_data"` and `newer_intervention_pending: null`. With `intervention_id` exactly
  that intervention is measured (possibly `insufficient_data`) and `newer_intervention_pending` is `null`. A merchant
  with no intervention gets `intervention: null, newer_intervention_pending: null, impact: null, series: []` (200). `series` covers the baseline start to the post end, oldest first.
  errors: 404 unknown merchant (`"Merchant not found"`) · 404 `intervention_id` unknown or belonging to another merchant
  (`"Intervention not found for this merchant"`)
- `GET /analytics/impact` → `{label, caveat, merchants_measured, overall_avg_change_pct,
  by_action {action: {label, merchants, avg_change_pct}}, merchants [{merchant_id, merchant_name, action, intervention_date, change_pct}]}`
  Uses each merchant's most recent measurable intervention (same rule as above); merchants with none are left out. `merchants` is sorted by `change_pct`, highest first.
  `overall_avg_change_pct` is `null` when no merchant is measurable (`by_action` is then `{}`).

Note: a new non-compliant visit creates a new intervention, which becomes the merchant's latest. Until it has 3 days of
post data it is not measurable, so the impact endpoint, `context.transaction_trend_pct` and `GET /analytics/impact` keep
using the previous measurable intervention, and the endpoint flags the new one in `newer_intervention_pending`. Pass its
`intervention_id` to see its own (`insufficient_data`) window.

#### Example: `GET /merchants/1/impact` (series trimmed)

```json
{
  "merchant_id": 1, "merchant_name": "Ramesh General Store", "label": "observed_change",
  "caveat": "Observed change around the intervention date. This is not proof that the intervention caused it: seasonality, festivals and other factors also move sales.",
  "intervention": {"id": 2, "action": "clear_qr_obstruction", "issue": "QR obstruction", "date": "2026-09-05", "visit_id": 2, "message_text": "Guidance sent: QR obstruction"},
  "newer_intervention_pending": null,
  "impact": {
    "intervention_date": "2026-09-05", "baseline_start": "2026-08-22", "baseline_end": "2026-09-04",
    "post_start": "2026-09-06", "post_end": "2026-09-19", "baseline_days": 14, "post_days": 14,
    "baseline_avg_daily_inr": 4212.86, "post_avg_daily_inr": 4950.76, "change_inr": 737.9, "change_pct": 17.5,
    "baseline_avg_txn_count": 32.0, "post_avg_txn_count": 40.2, "status": "ok", "label": "observed_change",
    "caveat": "Observed change around the intervention date. This is not proof that the intervention caused it: seasonality, festivals and other factors also move sales."
  },
  "series": [
    {"date": "2026-08-22", "amount_inr": 4255.62, "txn_count": 26, "phase": "baseline"},
    {"date": "2026-09-04", "amount_inr": 4308.13, "txn_count": 23, "phase": "baseline"},
    {"date": "2026-09-05", "amount_inr": 4283.58, "txn_count": 36, "phase": "intervention"},
    {"date": "2026-09-06", "amount_inr": 4818.7, "txn_count": 25, "phase": "post"}
  ]
}
```

The same merchant right after a new non-compliant visit today: `intervention` and `impact` are unchanged (still the
2026-09-05 intervention, `change_pct: 17.5`), and the fresh intervention is flagged:
`"newer_intervention_pending": {"id": 53, "action": "clear_qr_obstruction", "issue": "QR obstruction", "date": "2026-09-25", "visit_id": 54}`.
`GET /merchants/1/impact?intervention_id=53` shows that fresh one on its own:
`"impact": {..., "baseline_days": 14, "post_days": 0, "baseline_avg_daily_inr": 4953.24, "post_avg_daily_inr": null,
"change_inr": null, "change_pct": null, "status": "insufficient_data", ...}`, `"newer_intervention_pending": null`.

#### Example: `GET /analytics/impact` (merchants trimmed)

```json
{
  "label": "observed_change",
  "caveat": "Observed change around the intervention date. This is not proof that the intervention caused it: seasonality, festivals and other factors also move sales.",
  "merchants_measured": 19, "overall_avg_change_pct": 1.6,
  "by_action": {
    "install_soundbox": {"label": "Soundbox missing", "merchants": 4, "avg_change_pct": 0.6},
    "reduce_competitor_dominance": {"label": "Competitor QR dominance", "merchants": 8, "avg_change_pct": 1.0},
    "clear_qr_obstruction": {"label": "QR obstruction", "merchants": 4, "avg_change_pct": 4.2},
    "reposition_paytm_qr": {"label": "QR poorly positioned", "merchants": 3, "avg_change_pct": 1.4}
  },
  "merchants": [
    {"merchant_id": 1, "merchant_name": "Ramesh General Store", "action": "clear_qr_obstruction", "intervention_date": "2026-09-05", "change_pct": 17.5},
    {"merchant_id": 12, "merchant_name": "City Stationery", "action": "reduce_competitor_dominance", "intervention_date": "2026-09-08", "change_pct": 3.7}
  ]
}
```

## Manager

- `GET /dashboard` → `{kpis{visits_today, visits_7d, compliance_rate_7d, avg_qr_score_7d, avg_authenticity_7d, blocked_7d, open_escalations, incentives_inr_7d, whatsapp_sent_7d, avg_observed_change_pct}, decision_breakdown_7d, recent_visits[], fse_leaderboard[]}`
  `avg_observed_change_pct` = `overall_avg_change_pct` from `GET /analytics/impact` (the average **observed** change over
  each merchant's most recent measurable intervention, so a fresh visit does not drop a merchant from it); `null` when
  no merchant has one. Label it "Avg observed change".
- `GET /escalations?status=open` → `[{id, visit_id, merchant_name, fse_name, reason, status, photo_url, authenticity_score, qr_visibility_score, confidence, ...}]`
- `POST /escalations/{id}/approve` · `POST /escalations/{id}/reject` body `{resolved_by, note?}` → escalation · 409 if already resolved

Approval semantics:
- **Reject** → the visit becomes `rejected` (final, `completed_at` set). No incentive, no guidance.
- **Approve an unusable-photo escalation** (the audit's `recommended_action` is `retake_photo`: blurry, dark, or vision
  unavailable) → the visit becomes `completed` but its **`decision` stays `low_confidence`**. There is nothing to judge, so no
  automated action runs. Show it as "approved, no action".
- **Approve any other escalation** (authenticity review, suspicious image, low vision confidence) → the manager overrides the
  review gate and the real decision is applied: `decision` becomes `compliant` (incentive granted) or `non_compliant`
  (guidance + WhatsApp sent), `decision_reasons[0]` is `"Manager approved (<name>)"`, and the status is `completed`.

#### Example: `GET /dashboard`

```json
{
  "generated_at": "2026-09-24T20:18:44.033137",
  "kpis": {
    "visits_today": 5, "visits_7d": 5, "compliance_rate_7d": 50.0, "avg_qr_score_7d": 44.0,
    "avg_authenticity_7d": 77.8, "blocked_7d": 1, "open_escalations": 2, "incentives_inr_7d": 50, "whatsapp_sent_7d": 1,
    "avg_observed_change_pct": 1.6
  },
  "decision_breakdown_7d": {"low_confidence": 2, "compliant": 1, "non_compliant": 1, "fraud": 1},
  "recent_visits": [
    {"id": 53, "merchant_id": 1, "merchant_name": "Ramesh General Store", "fse_id": 1, "fse_name": "Amit Patil", "status": "escalated", "decision": "low_confidence", "qr_visibility_score": 0, "authenticity_score": 90, "lat": 18.510189, "lng": 73.7982, "received_at": "2026-09-24T20:18:39.441632"},
    {"id": 52, "merchant_id": 1, "merchant_name": "Ramesh General Store", "fse_id": 1, "fse_name": "Amit Patil", "status": "blocked", "decision": "fraud", "qr_visibility_score": 38, "authenticity_score": 30, "lat": 18.510189, "lng": 73.7982, "received_at": "2026-09-24T20:18:34.018532"}
  ],
  "fse_leaderboard": [
    {"fse_id": 1, "name": "Amit Patil", "territory": "Kothrud", "visits_7d": 4, "compliant_7d": 1, "verified_pct_7d": 75.0, "incentives_inr_7d": 50},
    {"fse_id": 2, "name": "Sneha Joshi", "territory": "Shivajinagar", "visits_7d": 1, "compliant_7d": 0, "verified_pct_7d": 100.0, "incentives_inr_7d": 0},
    {"fse_id": 3, "name": "Rahul Verma", "territory": "Hadapsar", "visits_7d": 0, "compliant_7d": 0, "verified_pct_7d": null, "incentives_inr_7d": 0}
  ]
}
```

`GET /analytics/dashboard` is an alias for `GET /dashboard` (same payload).

#### Example: `GET /escalations?status=open`

```json
[
  {
    "id": 2, "visit_id": 53, "merchant_id": 1, "reason": "Photo is blurry", "status": "open", "note": null,
    "resolved_by": null, "resolved_at": null, "created_at": "2026-09-24T20:18:39.451351",
    "merchant_name": "Ramesh General Store", "fse_name": "Amit Patil",
    "photo_url": "http://localhost:8000/media/visit_bc0512bc2cb243cc8ad607ee673d0f41.jpg",
    "authenticity_score": 90, "qr_visibility_score": 0, "confidence": 0.0
  },
  {
    "id": 1, "visit_id": 49, "merchant_id": 5, "reason": "Vision confidence 0.41 below 0.6", "status": "open", "note": null,
    "resolved_by": null, "resolved_at": null, "created_at": "2026-09-24T20:17:48.159523",
    "merchant_name": "Sai Dairy", "fse_name": "Sneha Joshi", "photo_url": null,
    "authenticity_score": 89, "qr_visibility_score": 55, "confidence": 0.41
  }
]
```

#### Example: `POST /escalations/2/approve` body `{"resolved_by": "Priya Manager"}`

```json
{
  "id": 2, "visit_id": 53, "merchant_id": 1, "reason": "Photo is blurry", "status": "approved", "note": null,
  "resolved_by": "Priya Manager", "resolved_at": "2026-09-24T20:18:48.749963", "created_at": "2026-09-24T20:18:39.451351",
  "merchant_name": "Ramesh General Store", "fse_name": "Amit Patil",
  "photo_url": "http://localhost:8000/media/visit_bc0512bc2cb243cc8ad607ee673d0f41.jpg",
  "authenticity_score": 90, "qr_visibility_score": 0, "confidence": 0.0
}
```

## Rep intelligence

All `/fse/{id}/...` endpoints return **404 for an unknown FSE**. "Visited" below means a **usable** visit: status
`completed` or `escalated`. Blocked, rejected, failed and in-flight visits do not count for the queue or coverage.

- `GET /fse` → `[{id, name, territory, home_lat, home_lng}]`
- `GET /fse/{id}/queue?lat=&lng=` → `[{merchant_id, name, owner_name, lat, lng, distance_m, priority, reasons[], latest_score, latest_decision, days_since_visit}]`
  The FSE's assigned merchants, highest `priority` first. Merchants with a usable visit today (UTC date) are left out.
  `lat`/`lng` (the rep's position) are optional: without them `distance_m` is `null` and distance does not affect the order.
  `latest_score`, `latest_decision` and `days_since_visit` come from the latest usable visit (`null` if there is none).
  Priority: 100 − last QR score (60 if never audited) + 2 per day since the visit (max 30 days; 60 if never visited)
  + 20 for an open issue (latest decision `non_compliant`/`low_confidence`) + 15 if transactions fell > 10% week on week
  − 5 per km away (max 30).
- `GET /fse/{id}/summary?lat=&lng=` → `{fse{id, name, territory}, coverage{assigned, visited, coverage_pct}, performance{visits, verified_pct, compliant_pct, avg_authenticity, incentives_inr, conversions}, next_best}`
  `coverage`: assigned merchants with a usable visit in the last 30 days. `performance`: all of the FSE's visits in the
  last 30 days (`verified_pct`, `compliant_pct`, `avg_authenticity` are `null` when there are none); `conversions` counts
  merchants that went from `non_compliant` to `compliant`. `next_best` is the first queue entry, or `null`.
- `GET /fse/{id}/visits?days=7` → `[VisitSummary]` (the same shape as `recent_visits[]`), oldest first, for the visit map.
  `days` must be 1-365 (422 otherwise). All statuses are included; colour pins by `status`/`decision`.

#### Example: `GET /fse/1/summary?lat=18.510189&lng=73.7982`

```json
{
  "fse": {"id": 1, "name": "Amit Patil", "territory": "Kothrud"},
  "coverage": {"assigned": 8, "visited": 8, "coverage_pct": 100.0},
  "performance": {"visits": 8, "verified_pct": 100.0, "compliant_pct": 50.0, "avg_authenticity": 92.0, "incentives_inr": 200, "conversions": 1},
  "next_best": {
    "merchant_id": 10, "name": "Om Sweets", "owner_name": "Deepak Agarwal", "lat": 18.513589, "lng": 73.79783,
    "distance_m": 380, "priority": 135.1,
    "reasons": ["Last QR score 33", "Not visited for 25 days", "Open issue: Competitor QR dominance"],
    "latest_score": 33, "latest_decision": "non_compliant", "days_since_visit": 25
  }
}
```

`GET /fse/1/queue` returns a list of entries shaped like `next_best`.

## Voice (Sarvam)

- `POST /voice/query` (multipart/form-data)
  fields: `fse_id` (int), `merchant_id` (int, optional: the merchant open on screen), `lat`, `lng` (optional), and either
  `audio` (wav/webm ≤ 10 MB) or `text` + `language` (default `hi-IN`)
  → `{transcript, language, intent (todays_visits|merchant_issue|unknown), answer_en, answer_local, audio_url, merchant_id}`
  With `audio`, Sarvam speech-to-text (`saaras:v3`) produces `transcript` and detects `language`; the `language` field is
  ignored. `answer_local` is `answer_en` translated to `language` and `audio_url` is the spoken answer; without a Sarvam
  key, or if translation/TTS fails, `answer_local` is the English text and `audio_url` is `null`.
  errors: 422 neither `text` nor `audio` · 404 unknown fse · 413 audio larger than 10 MB ·
  503 `audio` sent but `SARVAM_API_KEY` is not set · 502 Sarvam speech-to-text failed
- `POST /voice/tts` body `{text, language?}` (`language` defaults to `hi-IN`) → `{audio_url}` ·
  503 `SARVAM_API_KEY` is not set · 502 Sarvam TTS failed

#### Example: `POST /voice/query` with `fse_id=1`, `merchant_id=1`, `text=is merchant ka problem kya hai?` (no Sarvam key)

```json
{
  "transcript": "is merchant ka problem kya hai?", "language": "hi-IN", "intent": "merchant_issue",
  "answer_en": "Ramesh General Store: QR visibility score 42 out of 100. Main issue: QR obstruction. PhonePe QR is more prominent than Paytm. This has not been fixed for 2 visits. Observed transaction change since the last fix: +17.5 percent.",
  "answer_local": "Ramesh General Store: QR visibility score 42 out of 100. Main issue: QR obstruction. PhonePe QR is more prominent than Paytm. This has not been fixed for 2 visits. Observed transaction change since the last fix: +17.5 percent.",
  "audio_url": null, "merchant_id": 1
}
```

## Supporting

- `GET /visits?fse_id=&merchant_id=&limit=` · `GET /fraud/flagged` · `GET /fraud/{visit_id}` · `GET /audit/{visit_id}`
- `POST /audit/analyze-image` (multipart photo) → `{quality, audit, provider}` (stateless try-it; same 413/415/422 rules as `POST /visits`)
- `GET /incentives?fse_id=` → `{total_inr, items[]}` · `GET /transactions?merchant_id=&days=30`
- `GET /health` → which providers are live (`vision_provider`, `anthropic_key` (a key is configured), `n8n`, `memory`, `whatsapp`)

## Webhooks (Twilio-facing)

**Called by Twilio, not the frontend.**

- `POST /webhooks/twilio/status` (form-encoded Twilio status callback: `MessageSid`, `MessageStatus`, optional
  `ErrorCode`, `ErrorMessage`) → `204`, empty body. The backend asks Twilio for this callback (`StatusCallback`) only
  when `PUBLIC_BASE_URL` is publicly reachable (e.g. an ngrok `https://….ngrok.app` URL), because Twilio cannot reach
  `localhost` or LAN addresses. Requests must carry a valid `X-Twilio-Signature` computed with `TWILIO_AUTH_TOKEN` over
  `PUBLIC_BASE_URL` + the request path; a missing or wrong signature, or no Twilio auth token configured, → `403`.
  The notification whose `provider_ref` equals `MessageSid` moves to `delivered`, `read`, `failed` or `undelivered`;
  `queued`/`sending`/`sent` are ignored and a status never moves backwards (a late `delivered` after `read` keeps
  `read`). An unknown `MessageSid` is a no-op `204` (Twilio retries on non-2xx).
