// Loads one visit (GET /visits/{id}) plus its authenticity breakdown (GET /fraud/{id}), polls while the visit is
// "analyzing", and exposes runAnalysis() (POST /visits/{id}/analyze, then poll until a final status).
import { useCallback, useEffect, useRef, useState } from 'react'
import { getVisitDetail, pollVisit, startVisitAnalysis } from '../../services/visits'
import { getVisitFraud } from '../../services/fraud'

const fetchFraud = (id) => getVisitFraud(id).then((fraud) => ({ fraud, fraudError: null }), (fraudError) => ({ fraud: null, fraudError }))

export function useVisitEvidence(id) {
  // `forId` marks which route id the state belongs to: loading = the state is for another id.
  const [state, setState] = useState({ forId: null, visit: null, fraud: null, fraudError: null, error: null })
  const [busy, setBusy] = useState(false) // analysis request / polling in flight
  const [actionError, setActionError] = useState(null)
  const ctrl = useRef(null)

  const patch = useCallback((forId, p) => setState((s) => (s.forId === forId ? { ...s, ...p } : s)), [])

  const follow = useCallback(
    async (visitId) => {
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      setBusy(true)
      try {
        const final = await pollVisit(visitId, { signal: c.signal, onUpdate: (visit) => !c.signal.aborted && patch(visitId, { visit }) })
        if (!c.signal.aborted) patch(visitId, { visit: final, ...(await fetchFraud(visitId)) })
      } catch (e) {
        if (e?.name !== 'AbortError' && !c.signal.aborted) setActionError(e)
      } finally {
        if (!c.signal.aborted) setBusy(false)
      }
    },
    [patch],
  )

  useEffect(() => {
    let alive = true
    Promise.all([getVisitDetail(id), fetchFraud(id)])
      .then(([visit, f]) => {
        if (!alive) return
        setActionError(null)
        setState({ forId: id, visit, error: null, ...f })
        if (visit.status === 'analyzing') follow(id)
      })
      .catch((error) => alive && setState({ forId: id, visit: null, fraud: null, fraudError: null, error }))
    return () => {
      alive = false
      ctrl.current?.abort()
    }
  }, [id, follow])

  const runAnalysis = useCallback(async () => {
    setActionError(null)
    setBusy(true)
    try {
      const visit = await startVisitAnalysis(id)
      patch(id, { visit })
      if (visit.status === 'analyzing') await follow(id)
      else {
        patch(id, await fetchFraud(id))
        setBusy(false)
      }
    } catch (e) {
      setActionError(e)
      setBusy(false)
    }
  }, [id, follow, patch])

  const loading = state.forId !== id
  return {
    visit: loading ? null : state.visit,
    fraud: loading ? null : state.fraud,
    fraudError: loading ? null : state.fraudError,
    error: loading ? null : state.error,
    loading,
    busy,
    actionError,
    runAnalysis,
  }
}

// Error text for the UI: ApiError's message already carries the backend's detail + HTTP status.
export const errorText = (e) => (e ? e.message || String(e) : '')
