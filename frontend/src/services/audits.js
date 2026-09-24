import { get, post } from './api'
import { alerts, visit } from '../data/demoData'
export const getAlerts = () => get('/escalations', alerts)
export const getAudit = (id) => get(`/visits/${id}/audit`, visit)
export const approveEscalation = (id, note='') => post(`/escalations/${id}/approve`, { note }, { ok:true })
export const rejectEscalation = (id, note='') => post(`/escalations/${id}/reject`, { note }, { ok:true })
