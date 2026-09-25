import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, Footprints, LogOut, Store, Workflow } from 'lucide-react'
import { getCurrentFse, getCurrentFseId, signOut } from '../services/session'
import { getCurrentPosition } from '../services/geo'
import { getFseQueue, getFseSummary } from '../services/fse'
import { getMerchantDetail, getMerchantImpact } from '../services/merchants'
import { createVisit, getVisitDetail, pollVisit, startVisitAnalysis } from '../services/visits'
import { MOBILE_CSS } from '../components/mobile/mobileStyles'
import { HomeScreen, IdentityScreen, QueueScreen } from '../components/mobile/TodayScreens'
import { MerchantScreen } from '../components/mobile/MerchantScreen'
import { CaptureScreen } from '../components/mobile/CaptureScreen'
import { OutcomeScreen } from '../components/mobile/OutcomeScreen'
import { VoiceAssistant } from '../components/mobile/VoiceAssistant'
import { Loading } from '../components/mobile/common'

const pad2 = (n) => String(n).padStart(2, '0')
const clockText = (d) => `${pad2(d.getHours() % 12 || 12)}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`

export default function FseMobile() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const paramMerchant = Number(params.get('merchant')) || null

  const storedFse = getCurrentFse()
  const fseId = getCurrentFseId()

  const [screen, setScreen] = useState(paramMerchant ? 'M4' : 'M2')
  const [merchantId, setMerchantId] = useState(paramMerchant)
  const [now, setNow] = useState(() => new Date())

  // Device GPS (null on plain-http LAN phones).
  const [gps, setGps] = useState({ pending: true, pos: null })
  const refreshGps = useCallback(() => {
    setGps((g) => ({ ...g, pending: true }))
    getCurrentPosition().then((pos) => setGps({ pending: false, pos }))
  }, [])

  // Today: summary + queue, keyed by a reload counter.
  const [today, setToday] = useState({ summary: null, queue: null, summaryError: null, queueError: null })
  const [todayKey, setTodayKey] = useState(0)

  // Open merchant: detail, latest visit (for the Soundbox cell) and observed change.
  const [merchantData, setMerchantData] = useState({ id: null })
  const [merchantKey, setMerchantKey] = useState(0)

  // Current visit (capture -> pipeline -> outcome).
  const [visit, setVisit] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(null)
  const pollAbort = useRef(null)

  useEffect(() => {
    getCurrentPosition().then((pos) => setGps({ pending: false, pos }))
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearInterval(t)
      pollAbort.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (gps.pending) return undefined
    let live = true
    const pos = gps.pos ? { lat: gps.pos.lat, lng: gps.pos.lng } : {}
    Promise.allSettled([getFseSummary(fseId, pos), getFseQueue(fseId, pos)]).then(([s, q]) => {
      if (!live) return
      setToday({
        summary: s.status === 'fulfilled' ? s.value : null,
        summaryError: s.status === 'rejected' ? s.reason : null,
        queue: q.status === 'fulfilled' ? q.value : null,
        queueError: q.status === 'rejected' ? q.reason : null,
      })
    })
    return () => {
      live = false
    }
  }, [fseId, gps.pending, gps.pos, todayKey])

  const reloadToday = () => {
    setToday({ summary: null, queue: null, summaryError: null, queueError: null })
    setTodayKey((k) => k + 1)
  }

  // With no merchant chosen, the merchant/capture screens use the next best visit.
  const activeId = merchantId ?? today.summary?.next_best?.merchant_id ?? null

  useEffect(() => {
    if (!activeId) return undefined
    let live = true
    getMerchantDetail(activeId).then(
      (detail) => {
        if (!live) return
        setMerchantData({ id: activeId, detail })
        const latestId = detail.recent_visits?.[0]?.id
        if (latestId) {
          getVisitDetail(latestId).then(
            (v) => live && setMerchantData((d) => (d.id === activeId ? { ...d, latestVisit: v } : d)),
            () => {},
          )
        }
        getMerchantImpact(activeId).then(
          (impact) => live && setMerchantData((d) => (d.id === activeId ? { ...d, impact } : d)),
          (impactError) => live && setMerchantData((d) => (d.id === activeId ? { ...d, impactError } : d)),
        )
      },
      (error) => live && setMerchantData({ id: activeId, error }),
    )
    return () => {
      live = false
    }
  }, [activeId, merchantKey])

  const md = merchantData.id === activeId ? merchantData : { id: activeId }
  const merchant = md.detail?.merchant
  const queueEntry = (today.queue || []).find((q) => q.merchant_id === activeId)
  const identity = today.summary?.fse || storedFse || { id: fseId }

  const resetVisit = () => {
    pollAbort.current?.abort()
    setVisit(null)
    setSubmitError(null)
    setRetryError(null)
  }

  const openMerchant = (id) => {
    resetVisit()
    setMerchantId(id)
    setParams({ merchant: String(id) }, { replace: true })
    setScreen('M4')
  }

  const goQueue = () => {
    setParams({}, { replace: true })
    setScreen('M3')
  }

  const follow = async (v) => {
    setVisit(v)
    if (v.status !== 'analyzing') return v
    pollAbort.current?.abort()
    const ctrl = new AbortController()
    pollAbort.current = ctrl
    return pollVisit(v.id, { onUpdate: setVisit, signal: ctrl.signal })
  }

  const afterVisit = () => {
    setTodayKey((k) => k + 1)
    setMerchantKey((k) => k + 1)
  }

  const submitVisit = async ({ photo, captureSource, capturedAt, lat, lng }) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const v = await createVisit({ merchantId: activeId, fseId, lat, lng, photo, capturedAt, captureSource, analyze: true })
      setSubmitting(false)
      await follow(v)
      afterVisit()
    } catch (err) {
      if (err?.name !== 'AbortError') setSubmitError(err)
      setSubmitting(false)
    }
  }

  const retryVisit = async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      await follow(await startVisitAnalysis(visit.id))
      afterVisit()
    } catch (err) {
      if (err?.name !== 'AbortError') setRetryError(err)
    } finally {
      setRetrying(false)
    }
  }

  const logout = () => {
    signOut()
    nav('/login')
  }

  const SCREENS = [
    ['M1', 'M1 Identity'],
    ['M2', 'M2 Home'],
    ['M3', 'M3 Queue'],
    ['M4', 'M4 Merchant'],
    ['M5', 'M5 Capture'],
    ['M6', 'M6 Outcome'],
  ]

  return (
    <div className="page-shell">
      {/* Header only — no sidebar on this page */}
      <header className="page-header-bar">
        <div className="header-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="28" height="28" rx="9" fill="#2F80C0" />
            <circle cx="16" cy="16" r="6.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
            <circle cx="16" cy="16" r="2.1" fill="#FFFFFF" />
          </svg>
          <span className="wordmark">SightPay</span>
        </div>
        <span className="header-sep">/</span>
        <span className="crumb">FSE Mobile Experience</span>
        <button className="header-logout" onClick={logout}>
          <LogOut size={13} />
          Log out
        </button>
      </header>

      <div className="mobile-exp-container">
        {/* Subheader banner */}
        <div className="mobile-exp-header card">
          <div>
            <span className="pill ev">Live FSE App</span>
            <h2>FSE Field Copilot Experience</h2>
            <p className="mu">
              The SightPay app as {identity.name || `FSE ${identity.id}`} sees it on a phone, on live backend data. Open it on a
              phone for the full-screen version.
            </p>
          </div>
          <div className="mobile-nav-buttons">
            {SCREENS.map(([id, label]) => (
              <button key={id} className={`btn ${screen === id ? 'p' : ''}`} onClick={() => setScreen(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Smartphone Shell Frame */}
        <div className="phone-wrapper">
          <div className="phone-frame">
            {/* Phone Notch / Speaker */}
            <div className="phone-notch">
              <span className="notch-speaker" />
              <span className="notch-camera" />
            </div>

            {/* Phone Status Bar */}
            <div className="phone-status-bar">
              <span className="time">{clockText(now)}</span>
              <span className="network-icons">
                <span className="signal">FSE-{identity.id}</span>{' '}
                <span className="battery">{gps.pending ? 'GPS…' : gps.pos ? 'GPS ON' : 'NO GPS'}</span>
              </span>
            </div>

            {/* Screen Content */}
            <div className="phone-screen">
              {screen === 'M1' && (
                <IdentityScreen fse={identity} gps={gps} onEnter={() => setScreen('M2')} onSwitch={logout} />
              )}

              {screen === 'M2' && (
                <HomeScreen
                  fse={identity}
                  summary={today.summary}
                  queue={today.queue}
                  error={today.summaryError}
                  onRetry={reloadToday}
                  onOpenMerchant={openMerchant}
                  onQueue={goQueue}
                  onIdentity={() => setScreen('M1')}
                />
              )}

              {screen === 'M3' && (
                <QueueScreen
                  queue={today.queue}
                  error={today.queueError}
                  gps={gps}
                  onRetry={reloadToday}
                  onBack={() => setScreen('M2')}
                  onOpenMerchant={openMerchant}
                />
              )}

              {screen === 'M4' &&
                (activeId ? (
                  <MerchantScreen
                    detail={md.detail}
                    latestVisit={md.latestVisit}
                    impact={md.impact}
                    impactError={md.impactError}
                    error={md.error}
                    gps={gps}
                    queueEntry={queueEntry}
                    onRetry={() => setMerchantKey((k) => k + 1)}
                    onBack={goQueue}
                    onCapture={() => {
                      resetVisit()
                      setScreen('M5')
                    }}
                  />
                ) : (
                  <div className="m-screen">
                    <Loading label={today.summary ? 'No merchant open: pick one from the queue.' : 'Loading…'} />
                  </div>
                ))}

              {screen === 'M5' && (
                <CaptureScreen
                  merchant={merchant}
                  gps={gps}
                  onRefreshGps={refreshGps}
                  visit={visit}
                  submitting={submitting}
                  error={submitError}
                  onSubmit={submitVisit}
                  onReset={resetVisit}
                  onBack={() => setScreen('M4')}
                  onOutcome={() => setScreen('M6')}
                />
              )}

              {screen === 'M6' && (
                <OutcomeScreen
                  visit={visit}
                  retrying={retrying}
                  retryError={retryError}
                  onRetry={retryVisit}
                  onBack={() => setScreen('M5')}
                  onNextMerchant={() => {
                    resetVisit()
                    goQueue()
                  }}
                  onOpenAudit={() => nav(`/visits/${visit.id}`)}
                  onImpact={() => nav('/analytics')}
                />
              )}

              {screen !== 'M1' && (
                <VoiceAssistant
                  fseId={fseId}
                  merchantId={['M4', 'M5', 'M6'].includes(screen) ? activeId : null}
                  merchantName={['M4', 'M5', 'M6'].includes(screen) ? merchant?.name : null}
                  pos={gps.pos}
                />
              )}

              {/* Bottom Phone Bar */}
              <div className="phone-nav-bar">
                <button className={`p-nav-item ${screen === 'M2' ? 'active' : ''}`} onClick={() => setScreen('M2')}>
                  <Footprints size={18} />
                  <span>Home</span>
                </button>
                <button className={`p-nav-item ${screen === 'M3' ? 'active' : ''}`} onClick={goQueue}>
                  <Store size={18} />
                  <span>Queue</span>
                </button>

                <button
                  className={`p-nav-item ${screen === 'M5' || screen === 'M6' ? 'active' : ''}`}
                  onClick={() => setScreen('M5')}
                >
                  <Camera size={18} />
                  <span>Audit</span>
                </button>
                <button className="p-nav-item" onClick={() => nav('/manager')}>
                  <Workflow size={18} />
                  <span>Manager</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{MOBILE_CSS}</style>
    </div>
  )
}
