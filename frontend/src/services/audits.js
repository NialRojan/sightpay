import { get, postForm } from './api'

// GET /audit/{visit_id} -> AuditOut {paytm_qr_visible, qr_visibility_score, soundbox_visible, competitor,
//   competitor_dominance, qr_obstructed, image_quality, blur_score, suspicious_signals[], recommended_action,
//   confidence (0-1), notes, provider, created_at}. 404 "No audit for this visit yet".
export const getVisitAudit = (visitId) => get(`/audit/${visitId}`)

// POST /audit/analyze-image (multipart photo) -> {quality, audit, provider}. Stateless "try it"; nothing is stored.
export const analyzeImage = (photo) => postForm('/audit/analyze-image', { photo })

export { approveEscalation, rejectEscalation } from './escalations'
