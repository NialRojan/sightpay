import { get } from './api'

// GET /fraud/flagged -> [VisitSummary + verdict] for REVIEW_REQUIRED/BLOCKED visits (newest first, max 100)
export const listFlaggedVisits = () => get('/fraud/flagged')

// GET /fraud/{visit_id} -> {visit_id, score, verdict, signals[{signal, status pass|warn|fail, penalty, detail}]}
// UI copy rule: "combined evidence signals", never "EXIF-verified".
export const getVisitFraud = (visitId) => get(`/fraud/${visitId}`)
