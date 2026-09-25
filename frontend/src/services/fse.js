// Rep intelligence. All /fse/{id}/... endpoints 404 for an unknown FSE.
import { get } from './api'

// GET /fse -> [{id, name, territory, home_lat, home_lng}]  (used by Login to pick the current rep)
export const listFse = () => get('/fse')

// GET /fse/{id}/queue?lat=&lng= -> [{merchant_id, name, owner_name, lat, lng, distance_m, priority, reasons[],
//   latest_score, latest_decision, days_since_visit}], highest priority first; merchants visited today are left out.
export const getFseQueue = (fseId, { lat, lng } = {}) => get(`/fse/${fseId}/queue`, { lat, lng })

// GET /fse/{id}/summary?lat=&lng= -> {fse, coverage{assigned, visited, coverage_pct},
//   performance{visits, verified_pct, compliant_pct, avg_authenticity, incentives_inr, conversions}, next_best|null}
export const getFseSummary = (fseId, { lat, lng } = {}) => get(`/fse/${fseId}/summary`, { lat, lng })

// GET /fse/{id}/visits?days=7 -> VisitSummary[] oldest first (1 <= days <= 365), for the rep visit map.
export const getFseVisits = (fseId, days = 7) => get(`/fse/${fseId}/visits`, { days })
