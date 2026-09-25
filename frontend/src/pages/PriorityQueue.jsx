import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Navigation, Search, Route, ArrowRight, SlidersHorizontal, Info, X } from 'lucide-react'
import Layout from '../components/Layout'
import { PriorityBadge, ScoreRing } from '../components/ui'
import { getFseQueue, listFse } from '../services/fse'
import { listMerchants } from '../services/merchants'
import { getCurrentFse, getCurrentFseId } from '../services/session'
import { fmtKm } from '../services/format'
import {
  daysText,
  decisionText,
  errText,
  hasOpenIssue,
  level,
  priorityTerms,
  recommendedAction,
  usePosition,
} from '../components/rep/repData'

const FILTERS = ['All', 'Open issue', 'High', 'Medium', 'Low', 'Transaction Decline', 'Competitor Risk', 'Never visited', 'Nearby']

const FORMULA = [
  ['score', 'Last QR score', '100 − last QR visibility score (60 if never audited)', 100],
  ['days', 'Days since visit', '+2 per day since the last usable visit, max 30 days (60 if never visited)', 60],
  ['issue', 'Open issue', '+20 when the latest decision is non-compliant or needs review', 20],
  ['txn', 'Transaction decline', '+15 when daily transactions fell more than 10% week on week', 15],
  ['dist', 'Proximity / Distance', '−5 per km from your current position, max −30 (only with a location)', 30],
]

function ScoreBreakdown({ open, onClose, merchant }) {
  if (!open) return null
  const terms = merchant ? priorityTerms(merchant) : null
  return (
    <div className="score-modal-backdrop" onClick={onClose}>
      <div className="score-pop card" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <span className="pill ev">EXPLAINABLE PRIORITY</span>
            <h3 style={{ marginTop: 4 }}>SightPay Priority Score Breakdown</h3>
            <p className="mu sm">
              {merchant
                ? `${merchant.name}: priority ${merchant.priority} (points per factor below)`
                : 'How the backend ranks the queue'}
            </p>
          </div>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="score-factors">
          {FORMULA.map(([key, factor, desc, cap]) => {
            const pts = terms ? terms[key] : null
            const label = pts == null ? (key === 'dist' ? 'n/a' : '—') : `${pts > 0 ? '+' : pts < 0 ? '−' : ''}${Math.abs(Math.round(pts * 10) / 10)}`
            return (
              <div className="factor-row" key={factor}>
                <div className="factor-info">
                  <b>{factor}</b>
                  <span className="mu sm">{desc}</span>
                </div>
                <div className="factor-bar-wrap">
                  <div className="factor-bar"><i style={{ width: `${pts == null ? 0 : Math.min((Math.abs(pts) / cap) * 100, 100)}%` }} /></div>
                  <span className="weight-label">{terms ? label : `${key === 'dist' ? '−' : '+'}${cap}`}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="score-foot">
          <Info size={14} color="#B7FF3C" />
          <span>
            The queue is recomputed by the backend on every load from the latest usable visit, open issues, sales and
            your position. Merchants with a usable visit today are left out.
          </span>
        </div>
      </div>
    </div>
  )
}

function QueueRow({ m, index, selected, onSelect }) {
  const nav = useNavigate()
  return (
    <article className={`queue-row ${index === 0 ? 'hero-row' : ''} ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="rank">{String(index + 1).padStart(2, '0')}</div>
      <div className="qmain">
        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
          <PriorityBadge level={level(m)} />
          <span className="mu sm"><MapPinIcon /> {m.address || m.owner_name || '—'}</span>
        </div>
        <h3>{m.name}</h3>
        <div className="qmeta">
          <span><Navigation size={12} /> {fmtKm(m.distance_m)}</span>
          <span>Last visit {daysText(m.days_since_visit)}</span>
        </div>
      </div>

      <div className="reason">
        <span className="mu xs">AI REASON</span>
        {m.reasons?.map((r) => (
          <div key={r}><i /> {r}</div>
        ))}
      </div>

      <div className="action">
        <span className="mu xs">RECOMMENDED ACTION</span>
        <b>{recommendedAction(m)}</b>
        <span className="mu xs">
          Latest: {m.latest_score == null ? '—' : `${m.latest_score}/100`} · {decisionText(m.latest_decision)}
        </span>
      </div>

      <div className="score">
        <ScoreRing value={m.priority} size={64} max={200} unit="" />
        <span className="mu xs" style={{ marginTop: 4 }}>PRIORITY SCORE</span>
      </div>

      <div className="qbuttons">
        <button
          className="btn p"
          onClick={(e) => {
            e.stopPropagation()
            nav(`/fse/mobile?merchant=${m.merchant_id}`)
          }}
        >
          START VISIT <ArrowRight size={14} />
        </button>
        <button
          className="btn"
          onClick={(e) => {
            e.stopPropagation()
            nav(`/merchants/${m.merchant_id}`)
          }}
        >
          VIEW 360
        </button>
      </div>
    </article>
  )
}

function MapPinIcon() {
  return <span style={{ color: '#B7FF3C' }}>•</span>
}

// Places pins inside the grid by their real lat/lng (equirectangular projection of the queue's bounding box).
function projectPins(list) {
  const pts = list.filter((m) => m.lat != null && m.lng != null)
  if (!pts.length) return []
  const lats = pts.map((m) => m.lat)
  const lngs = pts.map((m) => m.lng)
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180))
  const spanX = (maxLng - minLng) * kx
  const spanY = maxLat - minLat
  const span = Math.max(spanX, spanY) || 1
  return pts.map((m) => ({
    m,
    left: 50 + (((m.lng - (minLng + maxLng) / 2) * kx) / span) * 76,
    top: 50 - ((m.lat - (minLat + maxLat) / 2) / span) * 76,
  }))
}

export default function PriorityQueue() {
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [scoreModalOpen, setScoreModalOpen] = useState(false)
  const [queue, setQueue] = useState(null)
  const [error, setError] = useState(null)
  const [fse, setFse] = useState(getCurrentFse())
  const pos = usePosition()
  const fseId = getCurrentFseId()

  const seq = useRef(0)

  const load = useCallback(
    (p) => {
      const n = ++seq.current // a slower, older response (e.g. without position) must not overwrite a newer one
      return Promise.all([getFseQueue(fseId, p || {}), listMerchants()])
        .then(([q, merchants]) => {
          if (n !== seq.current) return
          setError(null)
          const byId = new Map(merchants.map((mm) => [mm.id, mm]))
          setQueue(q.map((row) => ({ ...row, address: byId.get(row.merchant_id)?.address || null })))
          setSelected((s) => (s != null && q.some((r) => r.merchant_id === s) ? s : q[0]?.merchant_id ?? null))
        })
        .catch((e) => n === seq.current && setError(e))
    },
    [fseId],
  )

  // Load once without a position (fast), then again with it when the device gives one (adds distance to the order).
  useEffect(() => {
    load(null)
  }, [load])
  useEffect(() => {
    // The name is only for the heading; the session has it once somebody logged in.
    if (getCurrentFse()) return
    listFse()
      .then((all) => setFse(all.find((f) => f.id === fseId) || null))
      .catch(() => {})
  }, [fseId])
  useEffect(() => {
    if (pos) load(pos)
  }, [pos, load])

  const list = useMemo(() => (queue || []).filter((m) => {
    const text = `${m.name} ${m.owner_name || ''} ${m.address || ''}`.toLowerCase()
    if (query && !text.includes(query.toLowerCase())) return false
    const reasons = m.reasons || []
    if (filter === 'All') return true
    if (filter === 'High') return level(m) === 'HIGH'
    if (filter === 'Medium') return level(m) === 'MEDIUM'
    if (filter === 'Low') return level(m) === 'LOW'
    if (filter === 'Open issue') return hasOpenIssue(m)
    if (filter === 'Transaction Decline') return reasons.some((r) => r.startsWith('Transactions'))
    if (filter === 'Competitor Risk') return reasons.some((r) => r.includes('Competitor'))
    if (filter === 'Never visited') return m.days_since_visit == null
    if (filter === 'Nearby') return m.distance_m != null && m.distance_m <= 2000
    return true
  }), [queue, filter, query])

  const pins = useMemo(() => projectPins(queue || []), [queue])
  const high = (queue || []).filter((m) => level(m) === 'HIGH').length
  const selectedRow = (queue || []).find((m) => m.merchant_id === selected) || null
  const nearest = pos && queue?.length ? Math.min(...queue.map((m) => m.distance_m ?? Infinity)) : null

  return (
    <Layout crumb="Priority Queue">
      <style>{CSS}</style>
      <div className="pad queue-page">
        <div className="page-head">
          <div>
            <span className="pill ev">AI FIELD PRIORITIZATION</span>
            <h1 style={{ marginTop: 6 }}>AI Merchant Priority Queue</h1>
            <p className="mu">
              Next best visits for {fse?.name || `FSE #${fseId}`}
              {fse?.territory ? ` (${fse.territory})` : ''}, ranked by the SightPay priority score.{' '}
              {pos === undefined
                ? 'Checking your location…'
                : pos
                  ? 'Distance from your current location is included.'
                  : 'Location unavailable: distance is not used.'}
            </p>
          </div>
          <div className="head-actions">
            <button className="btn sel" title="The queue always covers today: merchants with a usable visit today are left out">
              Today <ChevronDown size={15} />
            </button>
            <button className="score-link btn" onClick={() => setScoreModalOpen(true)}>
              <Info size={14} color="#B7FF3C" /> Explain Score
            </button>
          </div>
        </div>

        {/* AI BANNER */}
        <section className="card ai-banner">
          <div>
            <span className="mu sm">PRIORITIZATION ENGINE</span>
            <h3 style={{ marginTop: 4, color: '#B7FF3C' }}>
              {queue == null
                ? 'Loading the queue…'
                : `${high} merchant${high === 1 ? '' : 's'} require${high === 1 ? 's' : ''} priority intervention today`}
            </h3>
            <p className="mu sm" style={{ marginTop: 4 }}>
              SightPay ranks merchants by last QR score, days since the last visit, open issues, week-on-week sales and
              proximity.
            </p>
          </div>
          <div className="banner-stats">
            <div><b>{queue ? queue.length : '—'}</b><span>IN QUEUE</span></div>
            <div><b>{queue ? high : '—'}</b><span>URGENT HIGH</span></div>
            <div><b>{nearest != null && Number.isFinite(nearest) ? fmtKm(nearest) : '—'}</b><span>NEAREST</span></div>
          </div>
        </section>

        {/* FILTERBAR */}
        <div className="filterbar">
          <div className="filter-chips">
            <SlidersHorizontal size={14} color="#929A94" />
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
                disabled={f === 'Nearby' && !pos}
                title={f === 'Nearby' ? (pos ? 'Within 2 km of you' : 'Needs your location') : undefined}
              >
                {f}
              </button>
            ))}
          </div>
          <label className="search queue-search">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merchant name or location..." />
          </label>
        </div>

        {/* MAIN LAYOUT */}
        <div className="queue-layout">
          <div className="queue-list">
            {error && (
              <div className="card">
                <h3>Could not load the priority queue</h3>
                <p className="mu sm">{errText(error)}</p>
                <button className="btn" style={{ marginTop: 10 }} onClick={() => load(pos)}>Retry</button>
              </div>
            )}
            {!error && queue == null && <div className="card mu">Loading priority queue…</div>}
            {!error && queue && list.length === 0 && (
              <div className="card mu">
                {queue.length === 0
                  ? 'Nothing left in the queue: every assigned merchant has a usable visit today.'
                  : 'No merchant matches this filter.'}
              </div>
            )}
            {list.map((m, i) => (
              <QueueRow
                key={m.merchant_id}
                m={m}
                index={i}
                selected={selected === m.merchant_id}
                onSelect={() => setSelected(m.merchant_id)}
              />
            ))}
          </div>

          <aside className="queue-map card">
            <div className="row" style={{ marginBottom: 12 }}>
              <div>
                <h2>Field Priority Grid</h2>
                <span className="mu sm">Pins at real shop locations · selected merchant highlighted</span>
              </div>
              <span className="grow" />
              <Route size={16} color="#B7FF3C" />
            </div>

            <div className="fake-map">
              <div className="map-grid" />
              {pins.map(({ m, left, top }) => (
                <i
                  key={m.merchant_id}
                  className={`map-pin ${m.merchant_id === selected ? 'selected' : ''} ${level(m).toLowerCase()}`}
                  style={{ left: left + '%', top: top + '%' }}
                  title={`${m.name} · priority ${m.priority}${m.distance_m != null ? ` · ${fmtKm(m.distance_m)}` : ''}`}
                  onClick={() => setSelected(m.merchant_id)}
                />
              ))}
            </div>

            <div className="map-legend">
              <span><i className="dot-red" /> High Priority</span>
              <span><i className="dot-amb" /> Medium / Low</span>
              <span><i className="dot-lime" /> Selected</span>
            </div>
          </aside>
        </div>

        <ScoreBreakdown open={scoreModalOpen} onClose={() => setScoreModalOpen(false)} merchant={selectedRow} />
      </div>
    </Layout>
  )
}

const CSS = `
.queue-page { display: grid; gap: 18px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 14px; }
.head-actions { display: flex; gap: 10px; }

.ai-banner { display: flex; justify-content: space-between; align-items: center; background: #111515; border: 1px solid var(--line-lime); }
.banner-stats { display: flex; gap: 24px; }
.banner-stats div { text-align: center; }
.banner-stats b { display: block; font-size: 22px; font-family: Sora; color: var(--blue); }
.banner-stats span { font-size: 10px; color: var(--ink2); font-weight: 700; }

.filterbar { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
.filter-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-btn { padding: 6px 14px; border-radius: 99px; background: var(--mist); border: 1px solid var(--line); font-size: 12px; color: var(--blue); cursor: pointer; }
.filter-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.filter-btn.active { background: var(--blue); color: #FFFFFF; font-weight: 700; border-color: var(--blue); }
.queue-search input { width: 220px; }

.queue-layout { display: grid; grid-template-columns: 1.7fr 1fr; gap: 16px; }
@media(max-width:1050px) { .queue-layout { grid-template-columns: 1fr; } }

.queue-list { display: grid; gap: 12px; }
.queue-row {
  display: grid; grid-template-columns: 40px 1.4fr 1.2fr 1.2fr 90px 180px; gap: 14px; align-items: center;
  background: #FFFFFF; border: 1px solid var(--line); border-radius: 18px; padding: 16px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px -4px rgba(10,27,61,0.04);
}
.queue-row:hover, .queue-row.selected { border-color: var(--blue); background: #F8FAFF; }
.queue-row.selected { box-shadow: 0 0 0 2px var(--blue); }

.rank { font-family: Sora; font-size: 16px; font-weight: 800; color: var(--blue); }
.qmain h3 { font-size: 15px; margin: 2px 0; color: var(--ink); }
.qmeta { display: flex; gap: 12px; font-size: 11px; color: var(--ink2); margin-top: 4px; }

.reason div { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink2); margin-top: 2px; }
.reason i { width: 4px; height: 4px; border-radius: 50%; background: var(--blue); }
.action b { display: block; font-size: 12px; color: var(--blue); margin-top: 2px; }

.score { text-align: center; display: flex; flex-direction: column; align-items: center; }
.qbuttons { display: flex; flex-direction: column; gap: 6px; }

/* MAP */
.queue-map { display: flex; flex-direction: column; height: 100%; min-height: 400px; }
.fake-map { flex: 1; position: relative; background: #EEF3FF; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; }
.map-grid { position: absolute; inset: 0; background-size: 24px 24px; background-image: linear-gradient(rgba(31,91,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,91,255,0.08) 1px, transparent 1px); }
.map-pin { position: absolute; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #FFFFFF; background: var(--amb); transform: translate(-50%,-50%); cursor: pointer; }
.map-pin.high { background: var(--red); }
.map-pin.selected { background: var(--blue); width: 18px; height: 18px; z-index: 10; box-shadow: 0 0 12px var(--blue); }
.map-legend { display: flex; gap: 16px; font-size: 11px; color: var(--ink2); margin-top: 12px; }
.map-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.dot-red { background: var(--red); }
.dot-amb { background: var(--amb); }
.dot-lime { background: var(--blue); }

/* MODAL */
.score-modal-backdrop { position: fixed; inset: 0; background: rgba(10,27,61,0.4); backdrop-filter: blur(4px); z-index: 100; display: grid; place-items: center; padding: 16px; }
.score-pop { width: 100%; max-width: 540px; background: #FFFFFF; border: 1px solid var(--line); box-shadow: 0 20px 40px -20px rgba(10,27,61,0.15); }
.score-factors { display: grid; gap: 12px; margin: 16px 0; }
.factor-row { display: grid; grid-template-columns: 1fr 140px; gap: 12px; align-items: center; background: #F8FAFF; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); }
.factor-info b { font-size: 13px; color: var(--ink); display: block; }
.factor-bar-wrap { display: flex; align-items: center; gap: 10px; }
.factor-bar { flex: 1; height: 6px; background: #EEF3FF; border-radius: 99px; overflow: hidden; }
.factor-bar i { display: block; height: 100%; background: var(--blue); border-radius: 99px; }
.weight-label { font-size: 12px; font-weight: 700; color: var(--blue); width: 32px; text-align: right; }
.score-foot { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--ink2); border-top: 1px solid var(--line); padding-top: 12px; }
`
