// Data-driven redirects for the old fixed demo links (/merchants/m1, /visits/SP-10482): the backend uses integer ids.
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { get } from '../services/api'
import { getCurrentFseId } from '../services/session'

function useFirstId(load) {
  const [state, setState] = useState({ id: undefined, error: null })
  useEffect(() => {
    let alive = true
    load()
      .then((id) => alive && setState({ id: id ?? null, error: null }))
      .catch((error) => alive && setState({ id: null, error }))
    return () => {
      alive = false
    }
  }, [load])
  return state
}

function Pending({ id, error, what }) {
  const text = error ? `Could not load ${what}: ${error.message}` : id === null ? `No ${what} yet.` : `Loading ${what}…`
  return <div className="pad mu" style={{ padding: 24 }}>{text}</div>
}

// Newest visit of the current FSE (falls back to the newest visit overall).
const loadLatestVisit = async () => {
  const mine = await get('/visits', { fse_id: getCurrentFseId(), limit: 1 })
  if (mine.length) return mine[0].id
  const any = await get('/visits', { limit: 1 })
  return any[0]?.id
}

// The current FSE's top-priority merchant (falls back to the first merchant).
const loadTopMerchant = async () => {
  const q = await get(`/fse/${getCurrentFseId()}/queue`)
  if (q.length) return q[0].merchant_id
  const all = await get('/merchants')
  return all[0]?.id
}

export function LatestVisitRedirect() {
  const { id, error } = useFirstId(loadLatestVisit)
  if (id) return <Navigate to={`/visits/${id}`} replace />
  return <Pending id={id} error={error} what="visits" />
}

export function TopMerchantRedirect() {
  const { id, error } = useFirstId(loadTopMerchant)
  if (id) return <Navigate to={`/merchants/${id}`} replace />
  return <Pending id={id} error={error} what="merchants" />
}
