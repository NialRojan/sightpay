// Shared helpers for the rep desk pages (Fse, PriorityQueue, MerchantDetail). Everything here is derived from
// backend payloads; nothing is invented.
import { useEffect, useState } from 'react'
import { getCurrentPosition } from '../../services/geo'
import { ACTION_LABEL, DECISION_LABEL, parseUtc, priorityLevel } from '../../services/format'

// Device position once per mount: undefined while asking, null when unavailable/denied, {lat, lng} otherwise.
export function usePosition() {
  const [pos, setPos] = useState(undefined)
  useEffect(() => {
    let alive = true
    getCurrentPosition({ timeout: 6000 }).then((p) => alive && setPos(p ? { lat: p.lat, lng: p.lng } : null))
    return () => {
      alive = false
    }
  }, [])
  return pos
}

export const errText = (err) => err?.detail || err?.message || 'Request failed'

// "Open issue: Competitor QR dominance" -> "Competitor QR dominance"
export const openIssueFromReasons = (reasons = []) =>
  reasons.find((r) => r.startsWith('Open issue: '))?.slice('Open issue: '.length) || null

export const hasOpenIssue = (q) => q.latest_decision === 'non_compliant' || q.latest_decision === 'low_confidence'

export const daysText = (d) => (d == null ? 'never' : d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`)

export const decisionText = (d) => (d ? DECISION_LABEL[d] || d : 'Not audited yet')

// What the rep should do next at this merchant, from the queue reasons (or the latest audit when given).
export function recommendedAction(q, audit) {
  if (audit?.recommended_action) return ACTION_LABEL[audit.recommended_action] || audit.recommended_action
  const issue = openIssueFromReasons(q?.reasons)
  if (issue) return issue
  if (q?.latest_decision == null) return 'First audit of the counter'
  if (q?.latest_decision === 'compliant') return 'Routine check (last visit compliant)'
  return decisionText(q?.latest_decision)
}

// Rebuilds the backend priority from its documented terms (app/services/rep.py, docs/api-contract.md):
// 100 − last QR score (60 if never audited) + 2/day since visit (max 30 days; 60 if never) + 20 open issue
// + 15 transactions down >10% w/w − 5/km (max 30). Returned points are per factor; `priority` stays the backend value.
export function priorityTerms(q) {
  const score = q.latest_score == null ? 60 : 100 - q.latest_score
  const days = q.days_since_visit == null ? 60 : Math.min(q.days_since_visit, 30) * 2
  const issue = hasOpenIssue(q) ? 20 : 0
  const txn = (q.reasons || []).some((r) => r.startsWith('Transactions')) ? 15 : 0
  const dist = q.distance_m == null ? null : -Math.min((q.distance_m / 1000) * 5, 30)
  return { score, days, issue, txn, dist }
}

export const level = (q) => priorityLevel(q?.priority)

// Newest first by received_at
export const byNewest = (a, b) => (parseUtc(b.received_at) || 0) - (parseUtc(a.received_at) || 0)

// Straight-line distance in metres (for merchant pages when the device position is known).
export function haversine(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null
  const R = 6371000
  const toR = (x) => (x * Math.PI) / 180
  const dLat = toR(b.lat - a.lat)
  const dLng = toR(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
