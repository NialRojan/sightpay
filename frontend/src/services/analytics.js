import { get } from './api'
import { legacyHealth, legacyMini, legacyImpact } from './legacy'

// GET /dashboard (alias /analytics/dashboard) -> {generated_at, kpis{visits_today, visits_7d, compliance_rate_7d,
//   avg_qr_score_7d, avg_authenticity_7d, blocked_7d, open_escalations, incentives_inr_7d, whatsapp_sent_7d,
//   avg_observed_change_pct}, decision_breakdown_7d{}, recent_visits[], fse_leaderboard[]}
export const getDashboard = () => get('/dashboard')

// GET /analytics/impact -> {label, caveat, merchants_measured, overall_avg_change_pct,
//   by_action{action: {label, merchants, avg_change_pct}}, merchants[{merchant_id, merchant_name, action, intervention_date, change_pct}]}
export const getPortfolioImpact = () => get('/analytics/impact')

// GET /health -> {status, vision_provider, anthropic_key, n8n, memory, whatsapp} (which providers are live)
export const getSystemHealth = () => get('/health')

/* ---- Legacy names still imported by pages. TODO(page): switch to the functions above. ---- */
export const getHealth = legacyHealth // Fse.jsx "Merchant Health" graph: [{label, value}] of the rep's QR scores
export const getMini = legacyMini // Fse.jsx mini cards: [{k, v, warn}]
export const getImpact = legacyImpact // Analytics.jsx: {kpis, interventions, ...} partly mapped from /analytics/impact
