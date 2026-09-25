// TEMPORARY shims: they fetch REAL backend data and add the old demoData-shaped keys that the not-yet-migrated
// pages read, so nothing crashes before the page agents rewrite them. Every function here is TODO(page): once no
// page imports a legacy name any more, delete this file and the legacy exports in the service modules.
import { get } from './api'
import { getCurrentFse, getCurrentFseId } from './session'
import { fmtDate, fmtTime, fmtPct, priorityLevel } from './format'

const km = (m) => (m == null ? '—' : (m / 1000).toFixed(1))
const SIGNAL_WORD = { pass: 'VERIFIED', warn: 'WARNING', fail: 'FAILED' }

/* ---------------------------------- visits ---------------------------------- */

export function legacyVisitFields(v) {
  const sig = Object.fromEntries((v.authenticity?.signals || []).map((s) => [s.signal, s]))
  const iv = v.actions?.intervention
  return {
    ...v,
    merchant: { id: v.merchant_id, name: v.merchant_name },
    date: fmtDate(v.received_at),
    time: fmtTime(v.received_at),
    verification: {
      gps: SIGNAL_WORD[sig.gps?.status] || '—',
      timestamp: SIGNAL_WORD[sig.timestamp?.status] || '—',
      geofence: sig.gps?.detail || '—',
      hash: sig.duplicate_image ? (sig.duplicate_image.status === 'pass' ? 'UNIQUE' : 'REUSED') : '—',
      authenticity: v.authenticity?.score ?? '—',
    },
    evidenceChain: (v.pipeline_log || []).map((s) => [fmtTime(s.at), s.summary]),
    authenticitySignals: (v.authenticity?.signals || []).map((s) => [
      s.signal,
      s.status === 'pass' ? '✓' : `${s.status} (−${s.penalty})`,
    ]),
    guidance: {
      language: iv?.message_language || '—',
      message: iv?.message_text || (v.decision_reasons || []).join('; ') || 'No guidance for this visit.',
      audio: iv?.audio_url || null,
    },
  }
}

/* -------------------------------- merchants --------------------------------- */

export function legacyMerchantFields(d) {
  const m = d.merchant || {}
  return {
    ...d,
    id: String(m.id),
    name: m.name,
    location: m.address || '—',
    km: '—',
    qr: m.latest_score ?? 0,
    soundbox: null,
    trend: d.context?.transaction_trend_pct ?? 0,
    competitor: '—',
    comp: '—',
  }
}

export async function legacyQueueRows() {
  const q = await get(`/fse/${getCurrentFseId()}/queue`)
  return q.map((r) => ({
    ...r,
    id: r.merchant_id,
    pri: priorityLevel(r.priority),
    km: km(r.distance_m),
    qr: r.latest_score ?? 0,
    trend: 0,
    location: '',
    competitor: '—',
    comp: '—',
    action: r.reasons?.[r.reasons.length - 1] || 'Routine audit',
    last: r.days_since_visit == null ? 'never' : `${r.days_since_visit} days ago`,
    score: Math.min(100, Math.round(r.priority)),
  }))
}

export async function legacyMemory(id) {
  const d = await get(`/merchants/${id}`)
  const c = d.context || {}
  return [
    ...(c.previous_issues || []).map((x) => `Issue: ${x}`),
    ...(c.previous_interventions || []).map((x) => `Intervention: ${x.replaceAll('_', ' ')}`),
    ...(c.summary ? [c.summary] : []),
  ]
}

export async function legacyProfile() {
  const id = getCurrentFseId()
  const fse = getCurrentFse() || (await get('/fse')).find((f) => f.id === id) || { id, name: `FSE ${id}` }
  return { ...fse, first: String(fse.name).split(' ')[0], role: 'Field Sales Executive' }
}

/* ---------------------------- Fse.jsx dashboard ----------------------------- */

export async function legacyKpis() {
  const fseId = getCurrentFseId()
  const [s, q] = await Promise.all([get(`/fse/${fseId}/summary`), get(`/fse/${fseId}/queue`)])
  const high = q.filter((r) => r.priority >= 100).length
  return [
    { k: 'Assigned Merchants', v: s.coverage.assigned, d: `${q.length} still to visit today`, up: true },
    { k: 'Visited (30d)', v: s.coverage.visited, d: `${s.coverage.coverage_pct}% coverage`, up: true },
    { k: 'Priority Merchants', v: high, d: 'priority score ≥ 100', up: high === 0 },
    { k: 'Verified Visits', v: `${s.performance.verified_pct ?? '—'}%`, d: `${s.performance.visits} visits in 30 days`, up: true },
  ]
}

export async function legacyMapPoints() {
  const fseId = getCurrentFseId()
  const [q, merchants] = await Promise.all([get(`/fse/${fseId}/queue`), get('/merchants')])
  const pending = new Map(q.map((r) => [r.merchant_id, r]))
  return merchants
    .filter((m) => m.assigned_fse_id === fseId)
    .map((m) => {
      const r = pending.get(m.id)
      return {
        id: m.id,
        name: m.name,
        address: m.address,
        lat: m.lat,
        lng: m.lng,
        completed: !r, // not in today's queue = visited today
        priority: r ? priorityLevel(r.priority).toLowerCase() : '',
      }
    })
}

export async function legacyActivity() {
  const visits = await get('/visits', { fse_id: getCurrentFseId(), limit: 6 })
  return visits.map((v) => ({
    t: fmtTime(v.received_at),
    title: `${v.status}${v.decision ? ` · ${v.decision.replace('_', ' ')}` : ''}`,
    sub: v.merchant_name,
    s: ['completed'].includes(v.status) ? 'ok' : 'wait',
    visit: v,
  }))
}

export async function legacyAlerts() {
  const rows = await get('/escalations', { status: 'open' })
  return rows.map((e) => ({
    ...e,
    sev: (e.authenticity_score ?? 100) < 70 ? 'HIGH' : 'MEDIUM',
    title: e.reason,
    m: e.merchant_name,
    at: fmtTime(e.created_at),
  }))
}

export async function legacyHealth() {
  const visits = await get(`/fse/${getCurrentFseId()}/visits`, { days: 30 })
  return visits
    .filter((v) => v.qr_visibility_score != null)
    .map((v) => ({ label: fmtDate(v.received_at), value: v.qr_visibility_score }))
}

export async function legacyMini() {
  const fseId = getCurrentFseId()
  const [s, dash] = await Promise.all([get(`/fse/${fseId}/summary`), get('/dashboard')])
  const obs = dash.kpis.avg_observed_change_pct
  return [
    { k: 'Avg Authenticity (30d)', v: s.performance.avg_authenticity ?? '—' },
    { k: 'Conversions (non-compliant → compliant)', v: String(s.performance.conversions) },
    { k: 'Blocked Visits (7d, all reps)', v: String(dash.kpis.blocked_7d), warn: dash.kpis.blocked_7d > 0 },
    { k: 'Avg Observed Change', v: fmtPct(obs) },
  ]
}

/* ------------------------------ Analytics.jsx ------------------------------- */

export async function legacyImpact() {
  const [imp, dash] = await Promise.all([get('/analytics/impact'), get('/dashboard')])
  const pct = fmtPct
  return {
    ...imp,
    kpis: [
      ['Merchants measured', String(imp.merchants_measured)],
      ['Avg observed change', pct(imp.overall_avg_change_pct)],
      ['Avg QR score (7d)', dash.kpis.avg_qr_score_7d ?? '—'],
      ['Merchants with positive change', String(imp.merchants.filter((m) => m.change_pct > 0).length)],
      ['Visits (7d)', String(dash.kpis.visits_7d)],
    ],
    // [name, merchants, merchants, merchants, change] like the old demo rows
    interventions: Object.values(imp.by_action).map((a) => [a.label, a.merchants, a.merchants, a.merchants, pct(a.avg_change_pct)]),
    beforeAfter: {}, // TODO(page): per-merchant series from GET /merchants/{id}/impact
    trend: [],
    insight: imp.caveat,
  }
}
