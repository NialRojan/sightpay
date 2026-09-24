import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Map, Navigation, Search, Route, ArrowRight, SlidersHorizontal, Info, Check, X } from 'lucide-react'
import Layout from '../components/Layout'
import { PriorityBadge, ScoreRing } from '../components/ui'
import { merchants } from '../data/demoData'

const filters = ['All', 'Critical', 'High', 'Medium', 'Low', 'Transaction Decline', 'Competitor Risk', 'Distance']

function ScoreBreakdown({ open, onClose }) {
  if (!open) return null
  return (
    <div className="score-modal-backdrop" onClick={onClose}>
      <div className="score-pop card" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <span className="pill ev">EXPLAINABLE AI</span>
            <h3 style={{ marginTop: 4 }}>SightPay Priority Score Breakdown</h3>
            <p className="mu sm">Operational decision engine weights</p>
          </div>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="score-factors">
          {[
            ['QR Visibility', '30%', 'From Vision AI counter analysis'],
            ['Transaction Trend', '25%', 'Observed volume change vs baseline'],
            ['Competitor Risk', '20%', 'PhonePe / GPay dominance & sticker presence'],
            ['Previous Intervention', '15%', 'Recency and outcome of last visit'],
            ['Proximity / Distance', '10%', 'Route distance from current FSE location'],
          ].map(([factor, weight, desc]) => (
            <div className="factor-row" key={factor}>
              <div className="factor-info">
                <b>{factor}</b>
                <span className="mu sm">{desc}</span>
              </div>
              <div className="factor-bar-wrap">
                <div className="factor-bar"><i style={{ width: weight }} /></div>
                <span className="weight-label">{weight}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="score-foot">
          <Info size={14} color="#B7FF3C" />
          <span>Scores are recalculated in real-time as field visits and transaction signals update.</span>
        </div>
      </div>
    </div>
  )
}

function QueueRow({ m, index, selected, onSelect }) {
  const nav = useNavigate()
  return (
    <article className={`queue-row ${index === 0 ? 'hero-row' : ''} ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="rank">0{index + 1}</div>
      <div className="qmain">
        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
          <PriorityBadge level={m.pri} />
          <span className="mu sm"><MapPinIcon /> {m.location}</span>
        </div>
        <h3>{m.name}</h3>
        <div className="qmeta">
          <span><Navigation size={12} /> {m.km} km</span>
          <span>Last visit {m.last}</span>
        </div>
      </div>

      <div className="reason">
        <span className="mu xs">AI REASON</span>
        {m.reasons?.slice(0, 3).map((r) => (
          <div key={r}><i /> {r}</div>
        ))}
      </div>

      <div className="action">
        <span className="mu xs">RECOMMENDED ACTION</span>
        <b>{m.action}</b>
      </div>

      <div className="score">
        <ScoreRing value={m.score} size={64} />
        <span className="mu xs" style={{ marginTop: 4 }}>SIGHTPAY SCORE</span>
      </div>

      <div className="qbuttons">
        <button
          className="btn p"
          onClick={(e) => {
            e.stopPropagation()
            nav(`/visits/${m.id === 'm1' ? 'SP-10482' : 'SP-' + m.id.toUpperCase()}`)
          }}
        >
          START VISIT <ArrowRight size={14} />
        </button>
        <button
          className="btn"
          onClick={(e) => {
            e.stopPropagation()
            nav(`/merchants/${m.id}`)
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

export default function PriorityQueue() {
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('m1')
  const [scoreModalOpen, setScoreModalOpen] = useState(false)

  const list = useMemo(() => merchants.filter((m) => {
    const text = (m.name + ' ' + m.location).toLowerCase()
    if (query && !text.includes(query.toLowerCase())) return false
    if (filter === 'All') return true
    if (filter === 'High') return m.pri === 'HIGH'
    if (filter === 'Medium') return m.pri === 'MEDIUM'
    if (filter === 'Low') return m.pri === 'LOW'
    if (filter === 'Critical') return m.score >= 80
    if (filter === 'Transaction Decline') return m.trend < 0
    if (filter === 'Competitor Risk') return m.comp === 'HIGH'
    if (filter === 'Distance') return m.km <= 2
    return true
  }), [filter, query])

  return (
    <Layout crumb="Priority Queue">
      <style>{CSS}</style>
      <div className="pad queue-page">
        <div className="page-head">
          <div>
            <span className="pill ev">AI FIELD PRIORITIZATION</span>
            <h1 style={{ marginTop: 6 }}>AI Merchant Priority Queue</h1>
            <p className="mu">Next best visits ranked by SightPay Priority Score & potential field uplift.</p>
          </div>
          <div className="head-actions">
            <button className="btn sel">Today <ChevronDown size={15} /></button>
            <button className="score-link btn" onClick={() => setScoreModalOpen(true)}>
              <Info size={14} color="#B7FF3C" /> Explain Score
            </button>
          </div>
        </div>

        {/* AI BANNER */}
        <section className="card ai-banner">
          <div>
            <span className="mu sm">PRIORITIZATION ENGINE</span>
            <h3 style={{ marginTop: 4, color: '#B7FF3C' }}>5 merchants require priority intervention today</h3>
            <p className="mu sm" style={{ marginTop: 4 }}>
              SightPay ranks merchants based on counter evidence, transaction trends, competitor dominance, recency and proximity.
            </p>
          </div>
          <div className="banner-stats">
            <div><b>5</b><span>ASSIGNED</span></div>
            <div><b>2</b><span>URGENT HIGH</span></div>
            <div><b>1.2 km</b><span>NEXT DISTANCE</span></div>
          </div>
        </section>

        {/* FILTERBAR */}
        <div className="filterbar">
          <div className="filter-chips">
            <SlidersHorizontal size={14} color="#929A94" />
            {filters.map((f) => (
              <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
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
            {list.map((m, i) => (
              <QueueRow key={m.id} m={m} index={i} selected={selected === m.id} onSelect={() => setSelected(m.id)} />
            ))}
          </div>

          <aside className="queue-map card">
            <div className="row" style={{ marginBottom: 12 }}>
              <div>
                <h2>Field Priority Grid</h2>
                <span className="mu sm">Selected merchant highlighted</span>
              </div>
              <span className="grow" />
              <Route size={16} color="#B7FF3C" />
            </div>

            <div className="fake-map">
              <div className="map-grid" />
              {merchants.map((m, i) => (
                <i
                  key={m.id}
                  className={`map-pin ${m.id === selected ? 'selected' : ''} ${m.pri.toLowerCase()}`}
                  style={{ left: (18 + i * 16) + '%', top: (26 + (i % 3) * 22) + '%' }}
                  title={m.name}
                  onClick={() => setSelected(m.id)}
                />
              ))}
            </div>

            <div className="map-legend">
              <span><i className="dot-red" /> High Priority</span>
              <span><i className="dot-amb" /> Medium</span>
              <span><i className="dot-lime" /> Selected</span>
            </div>
          </aside>
        </div>

        <ScoreBreakdown open={scoreModalOpen} onClose={() => setScoreModalOpen(false)} />
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
