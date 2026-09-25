import { get } from './api'

// GET /transactions?merchant_id=&days=30 -> [{txn_date, amount_inr, txn_count}] oldest first ([] if none)
export const listTransactions = (merchantId, days = 30) => get('/transactions', { merchant_id: merchantId, days })
