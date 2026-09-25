import { get } from './api'
import { legacyMerchantFields, legacyQueueRows, legacyMemory, legacyProfile } from './legacy'

// GET /merchants -> [{id, name, owner_name, phone, language, lat, lng, address, category, assigned_fse_id,
//                     assigned_fse_name, latest_score, latest_decision, last_visit_at}]
export const listMerchants = () => get('/merchants')

// GET /merchants/{id} -> {merchant, context, recent_visits[], interventions[], open_escalations[]}
export const getMerchantDetail = (id) => get(`/merchants/${id}`)

// GET /merchants/{id}/impact?intervention_id= -> {label, caveat, intervention, newer_intervention_pending, impact, series[]}
// Always show `caveat` under the chart and say "Observed change", never "uplift caused by".
export const getMerchantImpact = (id, interventionId) =>
  get(`/merchants/${id}/impact`, { intervention_id: interventionId })

/* ---- Legacy names still imported by pages. TODO(page): switch to the functions above. ---- */

// MerchantDetail.jsx: real detail plus the old flat demo keys (name, location, qr, trend, competitor, ...).
export const getMerchant = async (id) => legacyMerchantFields(await getMerchantDetail(id))
// Fse.jsx "AI Priority Queue" table / next best visit: the current FSE's real queue in the old row shape.
export const getMerchants = legacyQueueRows
// No memory endpoint: derived from GET /merchants/{id} context (previous issues/interventions + summary).
export const getMerchantMemory = legacyMemory
// No profile endpoint: the FSE chosen at login (GET /fse).
export const getProfile = legacyProfile
