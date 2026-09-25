import { get } from './api'

// GET /incentives?fse_id= -> {total_inr, items[{id, fse_id, merchant_id, visit_id, amount_inr, status, reason, created_at}]}
export const listIncentives = (fseId) => get('/incentives', { fse_id: fseId })
