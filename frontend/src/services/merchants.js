import { get } from './api'
import { merchants, memories } from '../data/demoData'
export const getMerchants = () => get('/merchants', merchants)
export const getMerchant = (id) => get(`/merchants/${id}`, merchants.find(m => m.id === id) || merchants[0])
export const getMerchantImpact = (id) => get(`/merchants/${id}/impact`, { qrBefore:38, qrAfter:81, txBefore:42, txAfter:50, competitorBefore:'HIGH', competitorAfter:'MEDIUM', observed:'+19%' })
export const getMerchantMemory = (id) => get(`/merchants/${id}/memory`, memories)
export const getProfile = () => get('/dashboard/profile', { name:'Aarav Sharma', first:'Aarav', role:'Field Sales Executive' })
