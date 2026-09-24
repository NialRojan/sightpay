👤 PERSON B — AI, Backend, n8n & Intelligence
Owns the actual SightPay brain.
This person should be responsible for making the demo genuinely end-to-end, rather than having fake buttons that magically change screens.

1. Backend API
Build the central backend:
/api
   /merchants
   /visits
   /audit
   /fraud
   /transactions
   /incentives
   /analytics
   /escalations
Responsible for:
Merchant data
FSE data
Visit creation
Image submission
AI audit results
Fraud results
Transaction history
Incentive status
Escalations
Impact calculations

2. Vision AI Engine 👁️
Implement the actual counter analysis.
Input:
Photo
Output structured JSON:
{
  "paytm_qr_visible": true,
  "qr_visibility_score": 38,
  "soundbox_visible": true,
  "competitor": "PhonePe",
  "competitor_dominance": "high",
  "recommended_action": "reposition_paytm_qr",
  "confidence": 0.93
}
Also handle:
blurry image
low confidence
competitor detection
QR obstruction
Soundbox visibility
suspicious image signals

3. Fraud / Evidence Engine 🛡️
Implement:
GPS radius verification
Timestamp
Image perceptual hash
Duplicate/reused image detection
Basic EXIF validation
Live-capture checks where technically possible
Fraud confidence
Output something like:
Visit Authenticity
       ↓
    94/100
       ↓
    VERIFIED
or
Visit Authenticity
       ↓
    31/100
       ↓
    REVIEW REQUIRED
Important: don't claim EXIF alone proves a photo is genuine. Treat these as combined signals.

4. n8n — Autonomous Action Layer ⚡
This is Person B's major responsibility.
Build the actual workflow:
Webhook
   ↓
Visit Received
   ↓
Fraud Check
   ↓
Vision AI
   ↓
Cognee Context
   ↓
Decision Node
   ├── Compliant
   │      ↓
   │   Incentive
   │
   ├── Non-compliant
   │      ↓
   │   Sarvam
   │      ↓
   │   WhatsApp
   │
   ├── Low Confidence
   │      ↓
   │   Manager Escalation
   │
   └── Fraud
          ↓
       Block
This workflow should actually execute during the demo.

5. Sarvam AI 🇮🇳
Implement:
STT
Rep can ask:
"Is merchant ka problem kya hai?"
or:
"Aaj mujhe kaunse merchants visit karne hain?"
TTS
Generate localized merchant guidance:
"Namaste Ramesh ji, Paytm QR ko billing counter ke paas rakhiye taaki customers ko clearly dikhe."
Ideally demonstrate:
English system diagnosis → Sarvam → Hindi/Marathi voice output
This makes Sarvam integration feel meaningful rather than decorative.

6. Cognee — Merchant Memory 🧠
Person B owns the memory layer.
Store relationships like:
Merchant
 ├── Rep
 ├── Visits
 ├── QR Issues
 ├── Competitors
 ├── Interventions
 ├── Incentives
 └── Transaction Outcomes
Example:
Merchant: Ramesh General Store
Previous issue: QR obstruction
Previous intervention: QR repositioned
Previous score: 42
Current score: 89
Transaction trend: +18%
Then the AI can actually use previous context.

7. Transaction Impact Engine 📈
Backend calculates:
14-day baseline
post-intervention transactions
percentage change
intervention date
merchant outcome
For example:
Baseline:
₹4,200/day

Post intervention:
₹4,950/day

Observed change:
+17.8%
Again, label this as observed uplift/change, not automatically causal proof.

8. Database
Person B owns the data layer:
Tables
users
fse_profiles
merchants
visits
visit_audits
fraud_signals
interventions
incentives
transactions
escalations
notifications
Seed enough realistic demo data to make the application feel alive.

🔥 Shared Integration Responsibility
Neither person should work in isolation.
Establish one contract:
Person B exposes
POST /visits
POST /visits/{id}/analyze
GET  /visits/{id}
GET  /merchants/{id}
GET  /merchants/{id}/impact
GET  /dashboard
GET  /escalations
POST /escalations/{id}/approve
Person A consumes those APIs.

🗓️ Recommended Execution Plan
Phase 1 — Foundation (Person B): Database, Backend, API contracts, n8n skeleton, Vision AI endpoint
Phase 2 — Core Demo Loop: FSE → Photo → Backend → Vision AI → Fraud → n8n → Decision → Action → Dashboard. Don't move forward until this works.
Phase 3 — Sponsor Integrations (Person B): Sarvam → n8n → WhatsApp; Cognee → Merchant Context → Decision Engine
Phase 4 — Rep Intelligence: Geo-stamping, Visit map, Priority queue, Coverage %, Next-best merchant, Visit history, Rep performance
Phase 5 — Impact Layer: Transaction history, Before/after comparison, 14-day observed change, Intervention effectiveness, Merchant impact dashboard

The actual priority
P0 — MUST WORK: Photo → Vision → Fraud → n8n decision → Action → Dashboard
P1 — Makes you stand out: Geo-stamp → Rep queue → Sarvam voice → Cognee memory
P2 — Makes the pitch powerful: Transaction impact → Before/after → intervention outcome
P3 — Polish: animations, advanced analytics, extra dashboards, etc.
The judges should be able to watch one merchant visit travel through the entire system live.
