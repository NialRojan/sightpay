import { get } from './api'

// GET /merchants -> [{id, name, owner_name, phone, language, lat, lng, address, category, assigned_fse_id,
//                     assigned_fse_name, latest_score, latest_decision, last_visit_at}]
export const listMerchants = () => get('/merchants')

// GET /merchants/{id} -> {merchant, context, recent_visits[], interventions[], open_escalations[]}
export const getMerchantDetail = (id) => get(`/merchants/${id}`)

// GET /merchants/{id}/impact?intervention_id= -> {label, caveat, intervention, newer_intervention_pending, impact, series[]}
// Always show `caveat` under the chart and say "Observed change", never "uplift caused by".
export const getMerchantImpact = (id, interventionId) =>
  get(`/merchants/${id}/impact`, { intervention_id: interventionId })
