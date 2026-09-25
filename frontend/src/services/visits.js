import { get, post } from './api'
import { kpis, mapPoints, activity, visit } from '../data/demoData'
export const getKpis = () => get('/dashboard/kpis', kpis)
export const getMapPoints = () => get('/dashboard/map', mapPoints)
export const getActivity = () => get('/visits/activity', activity)
export const getVisits = () => get('/visits', [visit])
export const getVisit = (id) => get(`/visits/${id}`, visit)
export const analyzeVisit = (id) => post(`/visits/${id}/analyze`, {}, visit)
