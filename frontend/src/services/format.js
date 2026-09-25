// Shared formatting for backend values. Safe to use from every page.

// Backend datetimes are naive UTC ISO strings ("2026-09-24T20:18:21.048841"): parse them as UTC.
export const parseUtc = (s) => (s ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : null)
const pad2 = (n) => String(n).padStart(2, '0')
export const fmtDate = (s) =>
  parseUtc(s)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) ?? '—'
export const fmtTime = (s) => {
  const d = parseUtc(s)
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '—'
}
// Signed percentage for observed change: +17.5% / −3.1% / — for null.
export const fmtPct = (x) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}%`)
export const fmtInr = (x) => (x == null ? '—' : `₹${Number(x).toLocaleString('en-IN')}`)
export const fmtKm = (m) => (m == null ? '—' : `${(m / 1000).toFixed(1)} km`)

// Queue priority number (roughly 0-200) -> badge level used by <PriorityBadge>.
export const priorityLevel = (p) => (p == null ? 'LOW' : p >= 100 ? 'HIGH' : p >= 60 ? 'MEDIUM' : 'LOW')

// audit.recommended_action / intervention.action (mirrors backend app/services/labels.py)
export const ACTION_LABEL = {
  none: 'No issue',
  reposition_paytm_qr: 'QR poorly positioned',
  clear_qr_obstruction: 'QR obstruction',
  install_soundbox: 'Soundbox missing',
  replace_damaged_qr: 'Damaged QR',
  reduce_competitor_dominance: 'Competitor QR dominance',
  retake_photo: 'Unusable photo',
}

export const DECISION_LABEL = {
  compliant: 'Compliant',
  non_compliant: 'Non-compliant',
  low_confidence: 'Needs review',
  fraud: 'Blocked (authenticity)',
}

// submitted|analyzing|completed|escalated|blocked|rejected|failed
export const STATUS_LABEL = {
  submitted: 'Submitted',
  analyzing: 'Analyzing',
  completed: 'Completed',
  escalated: 'Escalated to manager',
  blocked: 'Blocked',
  rejected: 'Rejected by manager',
  failed: 'Failed (retry)',
}

// pipeline_log[].step, in journey order
export const STEP_LABEL = {
  queued: 'Queued',
  fraud_check: 'Authenticity check',
  vision_ai: 'Vision AI',
  merchant_context: 'Merchant memory',
  decision: 'Decision',
  incentive: 'Incentive',
  guidance: 'Merchant guidance',
  whatsapp: 'WhatsApp',
  whatsapp_status: 'WhatsApp delivery',
  escalation: 'Escalated',
  block: 'Blocked',
  manager_review: 'Manager review',
  recovery: 'Recovery run',
  error: 'Error',
  complete: 'Complete',
}

// authenticity.signals[].signal
export const SIGNAL_LABEL = {
  live_capture: 'Live capture',
  timestamp: 'Capture time',
  exif: 'Photo metadata',
  gps: 'GPS distance',
  duplicate_image: 'Photo reuse',
}

// actions.notifications[].status
export const NOTIFICATION_LABEL = {
  dry_run: 'Logged (dry run, not sent)',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  undelivered: 'Undelivered',
}
