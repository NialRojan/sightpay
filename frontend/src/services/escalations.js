// Manager review queue. Reject -> visit "rejected". Approve -> visit "completed" and either the real decision is
// applied (compliant/non_compliant + actions) or, for an unusable photo, decision stays low_confidence ("approved, no action").
import { get, post } from './api'
import { getManagerName } from './session'

// GET /escalations?status=open|approved|rejected -> [{id, visit_id, merchant_id, reason, status, note, resolved_by,
//   resolved_at, created_at, merchant_name, fse_name, photo_url, authenticity_score, qr_visibility_score, confidence}]
export const listEscalations = (status = 'open') => get('/escalations', { status })

// Accepts (id, note) like the old API or (id, {note, resolvedBy}). 409 if already resolved.
function body(opts) {
  const o = typeof opts === 'string' || opts == null ? { note: opts } : opts
  return { resolved_by: o.resolvedBy || getManagerName(), note: o.note || undefined }
}

// POST /escalations/{id}/approve {resolved_by, note?} -> escalation row
export const approveEscalation = (id, opts) => post(`/escalations/${id}/approve`, body(opts))
// POST /escalations/{id}/reject {resolved_by, note?} -> escalation row
export const rejectEscalation = (id, opts) => post(`/escalations/${id}/reject`, body(opts))
