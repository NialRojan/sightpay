// Visits: the core demo loop. POST /visits (multipart) -> poll GET /visits/{id} while "analyzing".
import { get, postForm, request, mediaUrl } from './api'
import { legacyVisitFields, legacyKpis, legacyMapPoints, legacyActivity } from './legacy'

// GET /visits?fse_id=&merchant_id=&limit= -> VisitSummary[] (newest first, limit <= 200)
export const listVisits = ({ fseId, merchantId, limit } = {}) =>
  get('/visits', { fse_id: fseId, merchant_id: merchantId, limit })

// GET /visits/{id} -> VisitOut
export const getVisitDetail = (id) => get(`/visits/${id}`)

/**
 * POST /visits (multipart) -> 201 VisitOut.
 * - photo: File/Blob (JPEG/PNG/WebP <= 10 MB)
 * - captureSource: 'camera' for in-app capture, 'gallery' for a picked file (costs 25 authenticity points)
 * - capturedAt: Date or ISO string from the device clock at capture; omitted when unknown (never send '')
 * - analyze: true starts the pipeline right away (status is then analyzing|completed|escalated|blocked|failed)
 * Errors: 404 unknown merchant/fse, 413 > 10 MB, 415 unsupported format, 422 unreadable image.
 */
export function createVisit({ merchantId, fseId, lat, lng, photo, capturedAt, captureSource = 'camera', analyze = true }) {
  return postForm('/visits', {
    merchant_id: merchantId,
    fse_id: fseId,
    lat,
    lng,
    captured_at: capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt,
    capture_source: captureSource,
    analyze: analyze ? 'true' : undefined,
    photo,
  })
}

// POST /visits/{id}/analyze -> VisitOut. 409 unless status is submitted/failed (or a stale analyzing).
export const startVisitAnalysis = (id) => request(`/visits/${id}/analyze`, { method: 'POST' })

export const TERMINAL_STATUSES = ['completed', 'escalated', 'blocked', 'rejected', 'failed']

/**
 * Poll GET /visits/{id} every `intervalMs` while status is "analyzing" (n8n mode). Calls onUpdate(visit) on every
 * poll so the page can animate pipeline_log[]. Resolves with the final VisitOut; rejects on timeout or abort.
 */
export async function pollVisit(id, { intervalMs = 1000, timeoutMs = 90000, onUpdate, signal } = {}) {
  const started = Date.now()
  for (;;) {
    const v = await getVisitDetail(id)
    onUpdate?.(v)
    if (v.status !== 'analyzing') return v
    if (Date.now() - started > timeoutMs) throw new Error(`Visit ${id} is still analyzing after ${timeoutMs / 1000}s`)
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, intervalMs)
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
  }
}

// The visit photo, rewritten so it loads on a phone too (null for seeded visits: show a placeholder).
export const visitPhotoUrl = (visit) => mediaUrl(visit?.photo_url)

/* ---- Legacy names still imported by pages. They call the real API. TODO(page): drop the legacy fields. ---- */

// VisitAudit.jsx: real VisitOut plus the old demo keys (merchant, date, time, verification, evidenceChain, ...).
export const getVisit = async (id) => legacyVisitFields(await getVisitDetail(id))
export const analyzeVisit = async (id) => legacyVisitFields(await startVisitAnalysis(id))
export const getVisits = (params) => listVisits(params)
// Fse.jsx dashboard widgets, derived from the current FSE's summary/queue/visits.
export const getKpis = legacyKpis
export const getMapPoints = legacyMapPoints
export const getActivity = legacyActivity
