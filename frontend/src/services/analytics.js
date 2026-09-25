import { get } from './api'
import { health, mini, impact } from '../data/demoData'
export const getHealth = () => get('/analytics/health', health)
export const getMini = () => get('/analytics/summary', mini)
export const getImpact = () => get('/merchants/m1/impact', impact)
