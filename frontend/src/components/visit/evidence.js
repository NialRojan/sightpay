// Shared derivations for the visit evidence pages (VisitAudit, AIAudit). Everything here is computed from backend
// payloads (VisitOut, GET /fraud/{id}, POST /audit/analyze-image); nothing is invented.
import { ACTION_LABEL, DECISION_LABEL, SIGNAL_LABEL, STATUS_LABEL } from '../../services/format'

// Backend thresholds (docs/api-contract.md): QR visibility below 70 is non-compliant; authenticity >= 70 VERIFIED,
// 30-69 REVIEW_REQUIRED, < 30 or a reused photo BLOCKED.
export const QR_PASS = 70

export const VERDICT_LABEL = {
  VERIFIED: 'Multi-Signal Verified',
  REVIEW_REQUIRED: 'Review required',
  BLOCKED: 'Blocked',
}

export const LANGUAGE_LABEL = {
  'hi-IN': 'Hindi',
  'mr-IN': 'Marathi',
  'en-IN': 'English',
}

export const langLabel = (code) => LANGUAGE_LABEL[code] || code || '—'
export const statusLabel = (s) => STATUS_LABEL[s] || s || '—'
export const decisionLabel = (d) => DECISION_LABEL[d] || d || 'No decision yet'
export const actionLabel = (a) => ACTION_LABEL[a] || a || '—'
export const signalLabel = (s) => SIGNAL_LABEL[s] || s

// Existing pill colour classes in sightpay.css: COMPLETED (green), LOW/ev (blue), MEDIUM (amber), HIGH (red).
export function statusPill(status) {
  if (status === 'completed' || status === 'VERIFIED' || status === 'pass' || status === 'read' || status === 'delivered' || status === 'approved' || status === 'paid') return 'COMPLETED'
  if (status === 'blocked' || status === 'failed' || status === 'rejected' || status === 'fail' || status === 'undelivered' || status === 'BLOCKED') return 'HIGH'
  if (status === 'escalated' || status === 'warn' || status === 'REVIEW_REQUIRED' || status === 'open' || status === 'analyzing') return 'MEDIUM'
  return 'LOW'
}

// The analyze-image audit calls it suspicious_image_signals; the stored visit audit calls it suspicious_signals.
export const suspiciousOf = (audit) => audit?.suspicious_signals || audit?.suspicious_image_signals || []

// Paytm counter prominence has no backend field: derived from competitor/competitor_dominance (map, section 4).
export const paytmProminent = (audit) => !audit?.competitor || audit?.competitor_dominance === 'low'

// "QR clearly visible" replaces the old "QR near billing" row, which has no backend field.
export const qrClear = (audit) => Boolean(audit?.paytm_qr_visible && !audit?.qr_obstructed)

// The real audit findings as rubric rows: {label, value, pct (bar width), pass}.
export function auditChecks(audit, quality) {
  if (!audit) return []
  const score = Number(audit.qr_visibility_score) || 0
  const dominance = audit.competitor_dominance
  const imageQuality = audit.image_quality || quality?.verdict
  const blur = audit.blur_score ?? quality?.blur_score
  const rows = [
    { key: 'score', label: 'Paytm QR visibility', value: `${score}/100`, pct: score, pass: score >= QR_PASS },
    { key: 'visible', label: 'Paytm QR visible', value: audit.paytm_qr_visible ? 'Yes' : 'No', pass: Boolean(audit.paytm_qr_visible) },
    { key: 'obstructed', label: 'QR not obstructed', value: audit.qr_obstructed ? 'Obstructed' : 'Clear', pass: !audit.qr_obstructed },
    { key: 'soundbox', label: 'Soundbox visible', value: audit.soundbox_visible ? 'Visible' : 'Not visible', pass: Boolean(audit.soundbox_visible) },
    {
      key: 'competitor',
      label: 'Competitor dominance',
      value: audit.competitor ? `${audit.competitor} · ${dominance || '—'}` : 'None detected',
      pass: paytmProminent(audit),
    },
  ]
  if (imageQuality) {
    rows.push({
      key: 'quality',
      label: 'Image quality',
      value: `${imageQuality}${blur != null ? ` · blur ${Math.round(blur)}` : ''}`,
      pass: imageQuality === 'ok',
    })
  }
  return rows.map((r) => ({ ...r, pct: r.pct ?? (r.pass ? 100 : 0) }))
}

// Map authenticity signals by name ({gps: {...}, duplicate_image: {...}}).
export const signalsByName = (signals = []) => Object.fromEntries(signals.map((s) => [s.signal, s]))

// Photo reuse chip text from the duplicate_image signal.
export function reuseLabel(signals) {
  const dup = signalsByName(signals).duplicate_image
  if (!dup) return 'Photo reuse: not checked'
  return dup.status === 'fail' ? 'Photo REUSED' : 'Photo unique (no reuse)'
}

// Steps in first-seen order, for the pipeline strip.
export function uniqueSteps(log = []) {
  const seen = new Set()
  return log.filter((e) => (seen.has(e.step) ? false : seen.add(e.step)))
}

// guidance step summary is "{engine}: {issue} guidance in {language}[ with voice note]".
export function guidanceEngine(log = []) {
  const g = log.find((e) => e.step === 'guidance')
  return g ? g.summary.split(':')[0] : null
}

export const BAD_STEPS = new Set(['error', 'block'])
