import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  Navigation,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Zap,
} from 'lucide-react'
import Layout from '../components/Layout'
import { PriorityBadge, ScoreRing, StatCard } from '../components/ui'
import { getMerchant, getMerchantImpact, getMerchantMemory } from '../services/merchants'
import { memories as fallbackMemories, merchants } from '../data/demoData'

export default function MerchantDetail() {
  const { id = 'm1' } = useParams()
  const nav = useNavigate()
  const [m, setM] = useState(null)
  const [impact, setImpact] = useState(null)
  const [memory, setMemory] = useState(fallbackMemories)

  useEffect(() => {
    Promise.all([
      getMerchant(id),
      getMerchantImpact(id),
      getMerchantMemory(id),
    ]).then(([a, b, c]) => {
      setM(a || merchants[0])
      setImpact(b)
      setMemory(c || fallbackMemories)
    })
  }, [id])

  if (!m) {
    return (
      <Layout crumb="Merchant 360">
        <div className="pad mu">Loading merchant intelligence...</div>
      </Layout>
    )
  }

  const visitId = id === 'm1' ? 'SP-10482' : `SP-${id.toUpperCase()}`

  return (
    <Layout crumb={`Merchant / ${m.name}`}>
      <style>{CSS}</style>
      <div className="pad merchant-page">
        {/* Breadcrumb & Header */}
        <div className="m360-breadcrumb">
          <span onClick={() => nav('/queue')}>Priority Queue</span>
          <b>/</b>
          <span>{m.name}</span>
        </div>

        <div className="page-head">
          <div>
            <div className="status-line">
              <span className="pill ev">MERCHANT 360</span>
              <span className="status-dot-lime" /> ACTIVE MEMORY SYNCED
            </div>
            <h1 style={{ marginTop: 6 }}>{m.name}</h1>
            <p className="mu">
              <MapPin size={13} color="#B7FF3C" /> {m.location} · {m.km} km away · FSE: Aarav Sharma
            </p>
          </div>
          <div className="head-actions">
            <button className="btn" onClick={() => nav(`/visits/${visitId}`)}>
              <Navigation size={15} /> Start Visit / Audit
            </button>
            <button className="btn p" onClick={() => nav(`/visits/${visitId}`)}>
              Execute Recommended Action <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* Health Stat Cards */}
        <div className="g4 health-stats">
          <StatCard label="QR Visibility Score" value={`${m.qr} / 100`} note="Obstructed / Needs repositioning" up={false} />
          <StatCard label="Soundbox Status" value={`${m.soundbox || 82} / 100`} note="Healthy signal" up={true} />
          <StatCard label="Transaction Trend" value={`${m.trend}%`} note="vs 14-day baseline" up={m.trend >= 0} />
          <StatCard label="Competitor Risk" value={m.competitor || 'PhonePe'} note={`${m.comp} presence`} up={false} />
        </div>

        {/* Chart & AI Summary */}
        <div className="g2 merchant-main">
          <section className="card chart-panel">
            <div className="row">
              <div>
                <h2>Merchant Health Signals</h2>
                <span className="mu sm">14-day trend across visits and counter audits</span>
              </div>
              <span className="pill ev">Live Feed</span>
            </div>

            <div className="chart-placeholder">
              <svg className="big-chart" viewBox="0 0 600 200" preserveAspectRatio="none">
                <line x1="0" y1="170" x2="600" y2="170" stroke="rgba(245,247,244,0.06)" />
                <line x1="0" y1="110" x2="600" y2="110" stroke="rgba(245,247,244,0.06)" />
                <line x1="0" y1="50" x2="600" y2="50" stroke="rgba(245,247,244,0.06)" />

                {/* Lines */}
                <polyline points="0,80 100,92 200,105 300,125 400,140 500,155 600,165" fill="none" stroke="#B7FF3C" strokeWidth="3" />
                <polyline points="0,120 100,112 200,118 300,126 400,135 500,140 600,142" fill="none" stroke="#8BE6FF" strokeWidth="2.5" />
                <polyline points="0,160 100,150 200,135 300,110 400,90 500,70 600,50" fill="none" stroke="#FF6B5F" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <div className="chart-legend">
                <span><i className="l-lime" /> QR Visibility Score</span>
                <span><i className="l-sky" /> Transaction Volume</span>
                <span><i className="l-red" /> Competitor Dominance</span>
              </div>
            </div>
          </section>

          <section className="card ai-summary">
            <div className="row">
              <div>
                <span className="pill ev">COGNEE MEMORY RECALL</span>
                <h2 style={{ marginTop: 4 }}>AI Executive Summary</h2>
              </div>
              <Sparkles size={18} color="#B7FF3C" />
            </div>
            <p className="summary-text">
              SightPay has identified persistent QR visibility obstruction across recent visits. PhonePe is currently the primary payment option presented on the main counter. Moving the Paytm QR closer to the billing terminal is estimated to yield an observed transaction uplift of <b>+19%</b>.
            </p>
            <div className="confidence-box">
              <div className="row">
                <span className="mu sm">AI CONFIDENCE SCORE</span>
                <b className="lime">93%</b>
              </div>
              <div className="confidence-bar"><i style={{ width: '93%' }} /></div>
            </div>
            <div className="summary-tags">
              <span>Persistent QR obstruction</span>
              <span>PhonePe competitor risk</span>
              <span>Hindi Sarvam nudge queued</span>
            </div>
          </section>
        </div>

        {/* COGNEE MERCHANT MEMORY GRAPH */}
        <section className="card memory-card">
          <div className="row">
            <div>
              <span className="pill ev">CONTEXTUAL GRAPH DATABASE</span>
              <h2 style={{ marginTop: 4 }}>Cognee Merchant Memory Graph</h2>
              <p className="mu sm">Persistent contextual memory linking visits, issues, interventions, competitors and outcomes.</p>
            </div>
            <span className="mu sm">LAST MEMORY SYNC<br /><b className="lime">24 Sep 2026 · 09:42 AM</b></span>
          </div>

          <div className="memory-graph-container">
            <div className="m-graph-visual">
              <div className="m-center-node">
                <Brain size={22} color="#FFFFFF" />
                <b>{m.name}</b>
                <span className="mu xs">Merchant ID: {m.id.toUpperCase()}</span>
              </div>

              <div className="m-nodes-grid">
                <div className="m-node n-visits">
                  <span className="n-tag">VISITS</span>
                  <b>3 Completed</b>
                  <span className="mu xs">Last: 24 Sep</span>
                </div>
                <div className="m-node n-issues">
                  <span className="n-tag red">ISSUES</span>
                  <b>QR Obstruction</b>
                  <span className="mu xs">Score: {m.qr}/100</span>
                </div>
                <div className="m-node n-interventions">
                  <span className="n-tag lime">INTERVENTIONS</span>
                  <b>QR Repositioning</b>
                  <span className="mu xs">Sarvam Hindi sent</span>
                </div>
                <div className="m-node n-competitors">
                  <span className="n-tag amb">COMPETITOR</span>
                  <b>PhonePe HIGH</b>
                  <span className="mu xs">Sticker on counter</span>
                </div>
                <div className="m-node n-outcomes">
                  <span className="n-tag sky">OUTCOMES</span>
                  <b>+19% Expected</b>
                  <span className="mu xs">14-day window</span>
                </div>
              </div>
            </div>

            <div className="memory-events-list">
              <h4>Memory Stream</h4>
              {memory.map((mem, idx) => (
                <div className="memory-item" key={idx}>
                  <CheckCircle2 size={14} color="#1F5BFF" />
                  <span>{mem}</span>
                  <span className="mu xs">{idx === 0 ? 'Today' : idx === 1 ? 'Today' : 'Previous Visit'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Visit History */}
        <section className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <div>
              <h2>Visit Audit History</h2>
              <span className="mu sm">Structured records saved to transactional database</span>
            </div>
            <button className="btn">View All Records</button>
          </div>

          <div className="data-table">
            <div className="tr th">
              <span>VISIT ID</span>
              <span>DATE</span>
              <span>FSE</span>
              <span>QR SCORE</span>
              <span>AUTHENTICITY</span>
              <span>STATUS</span>
              <span>ACTION</span>
            </div>
            {[
              ['SP-10482', '24 Sep 2026', 'Aarav Sharma', '38 / 100', '94 / 100', 'Verified', 'Reposition Paytm QR'],
              ['SP-10476', '20 Sep 2026', 'Aarav Sharma', '42 / 100', '91 / 100', 'Verified', 'Merchant Guidance'],
              ['SP-10461', '15 Sep 2026', 'Aarav Sharma', '61 / 100', '96 / 100', 'Verified', 'Soundbox Check'],
            ].map((r) => (
              <div className="tr clickable" key={r[0]} onClick={() => nav(`/visits/${r[0]}`)}>
                <span className="lime font-mono"><b>{r[0]}</b></span>
                <span>{r[1]}</span>
                <span>{r[2]}</span>
                <td><span className="qrbar"><i style={{ width: r[3] }} /></span> {r[3]}</td>
                <td><span className="lime">{r[4]}</span></td>
                <td><span className="pill COMPLETED">{r[5]}</span></td>
                <td><b>{r[6]}</b></td>
              </div>
            ))}
          </div>
        </section>

        {/* Next Best Action Banner */}
        <div className="card hero-impact">
          <div>
            <span className="pill ev">RECOMMENDED NEXT ACTION</span>
            <h2 style={{ marginTop: 6, color: '#1F5BFF' }}>Reposition Paytm QR & track observed change over 14 days</h2>
            <p className="mu sm" style={{ marginTop: 4 }}>
              The next audit will automatically compare counter visibility score and daily transaction behavior against this merchant memory.
            </p>
          </div>
          <button className="btn p" onClick={() => nav(`/visits/${visitId}`)}>
            Start Visit Audit <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </Layout>
  )
}

const CSS = `
.merchant-page { display: grid; gap: 18px; }
.m360-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink2); }
.m360-breadcrumb span { cursor: pointer; }
.m360-breadcrumb span:hover { color: var(--lime); }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 14px; }
.status-line { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; }
.status-dot-lime { width: 6px; height: 6px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 6px var(--lime); }
.head-actions { display: flex; gap: 10px; }

.chart-placeholder { position: relative; margin-top: 14px; }
.big-chart { width: 100%; height: 180px; }
.chart-legend { display: flex; gap: 20px; font-size: 11px; color: var(--ink2); margin-top: 10px; }
.chart-legend i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 6px; }
.l-lime { background: var(--lime); }
.l-sky { background: var(--sky); }
.l-red { background: var(--red); }

.ai-summary { display: flex; flex-direction: column; justify-content: space-between; background: #FFFFFF; border: 1px solid var(--line); }
.summary-text { font-size: 13.5px; line-height: 1.6; color: var(--ink); margin: 10px 0; }
.confidence-box { background: #F8FAFF; padding: 12px; border-radius: 12px; border: 1px solid var(--line); margin: 10px 0; }
.confidence-bar { height: 5px; background: #EEF3FF; border-radius: 99px; overflow: hidden; margin-top: 6px; }
.confidence-bar i { display: block; height: 100%; background: var(--lime); border-radius: 99px; }
.summary-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.summary-tags span { font-size: 11px; background: #EEF3FF; color: var(--lime); padding: 4px 10px; border-radius: 99px; border: 1px solid var(--line); }

/* MEMORY GRAPH */
.memory-card { background: #FFFFFF; border: 1px solid var(--line); }
.memory-graph-container { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; margin-top: 16px; }
@media(max-width:900px) { .memory-graph-container { grid-template-columns: 1fr; } }

.m-graph-visual { background: #EEF3FF; border-radius: 16px; padding: 20px; border: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; gap: 16px; position: relative; }
.m-center-node { background: var(--lime); color: #FFFFFF; padding: 12px 20px; border-radius: 18px; text-align: center; box-shadow: 0 8px 24px -6px rgba(31,91,255,0.35); display: flex; flex-direction: column; align-items: center; }
.m-center-node b { font-size: 16px; font-family: Sora; color: #FFFFFF; }

.m-nodes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; width: 100%; }
.m-node { background: #FFFFFF; border: 1px solid var(--line); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
.n-tag { font-size: 9px; font-weight: 800; color: var(--ink2); }
.n-tag.red { color: var(--red); }
.n-tag.lime { color: var(--lime); }
.n-tag.amb { color: var(--amb); }
.n-tag.sky { color: var(--sky); }
.m-node b { font-size: 12px; color: var(--ink); }

.memory-events-list { display: flex; flex-direction: column; gap: 8px; background: #F8FAFF; padding: 14px; border-radius: 16px; border: 1px solid var(--line); }
.memory-events-list h4 { font-size: 13px; color: var(--ink2); margin-bottom: 4px; }
.memory-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink); padding: 8px 0; border-bottom: 1px solid var(--line); }
.memory-item:last-child { border-bottom: 0; }

.data-table { overflow-x: auto; }
.tr { display: grid; grid-template-columns: 100px 110px 120px 100px 110px 100px 1fr; gap: 10px; padding: 12px 8px; border-bottom: 1px solid var(--line); align-items: center; font-size: 13px; }
.tr.th { font-size: 11px; font-weight: 700; color: var(--ink2); }
.tr.clickable:hover { background: #161C1C; cursor: pointer; }

.hero-impact { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; background: #111515; border: 1px solid var(--line-lime); }
`
