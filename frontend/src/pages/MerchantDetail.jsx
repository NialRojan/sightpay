import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, MapPin, Navigation, Sparkles } from 'lucide-react'
import Layout from '../components/Layout'
import { StatCard } from '../components/ui'
import ImpactChart from '../components/rep/ImpactChart'
import { errText, haversine, usePosition } from '../components/rep/repData'
import { getMerchantDetail, getMerchantImpact } from '../services/merchants'
import { getVisitAudit } from '../services/audits'
import { mediaUrl } from '../services/api'
import { ACTION_LABEL, DECISION_LABEL, STATUS_LABEL, fmtDate, fmtKm, fmtPct, fmtTime } from '../services/format'

const SOURCE_LABEL = { sql: 'Memory: SQL', cognee: 'Memory: Cognee', sql_fallback: 'Memory: SQL (Cognee fallback)' }
const DOMINANCE = { none: 'None', low: 'LOW', medium: 'MEDIUM', high: 'HIGH' }

function ErrorCard({ title, err, onRetry }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2>{title}</h2>
      <p className="mu">{errText(err)}</p>
      {onRetry && <button className="btn" style={{ marginTop: 10 }} onClick={onRetry}>Retry</button>}
    </div>
  )
}

export default function MerchantDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const pos = usePosition()
  // Results are stored with the request key they answer, so a stale response never shows under another id and
  // "loading" is simply "no result for the current key yet".
  const [detailRes, setDetailRes] = useState(null) // {key, data?, error?}
  const [reload, setReload] = useState(0)
  const [pick, setPick] = useState({ id: null, interventionId: null }) // chosen intervention for this merchant
  const [impactRes, setImpactRes] = useState(null) // {key, data?, error?}
  const [auditRes, setAuditRes] = useState(null) // {key, audit, error?}
  const [showAll, setShowAll] = useState(false)

  const detailKey = `${id}:${reload}`
  const interventionId = pick.id === id ? pick.interventionId : null
  const impactKey = `${id}:${interventionId ?? ''}`

  useEffect(() => {
    let alive = true
    getMerchantDetail(id)
      .then((data) => {
        if (!alive) return
        setDetailRes({ key: detailKey, data })
        const latest = data.recent_visits?.[0]
        if (!latest) return setAuditRes({ key: detailKey, audit: null })
        // Soundbox / competitor / confidence live on the latest visit's audit, not on the merchant payload.
        getVisitAudit(latest.id)
          .then((audit) => alive && setAuditRes({ key: detailKey, audit }))
          .catch((e) => alive && setAuditRes({ key: detailKey, audit: null, error: e?.status === 404 ? null : e }))
      })
      .catch((e) => alive && setDetailRes({ key: detailKey, error: e }))
    return () => {
      alive = false
    }
  }, [id, detailKey])

  useEffect(() => {
    let alive = true
    getMerchantImpact(id, interventionId ?? undefined)
      .then((data) => alive && setImpactRes({ key: impactKey, data }))
      .catch((e) => alive && setImpactRes({ key: impactKey, error: e }))
    return () => {
      alive = false
    }
  }, [id, interventionId, impactKey])

  const current = detailRes?.key === detailKey ? detailRes : null
  const d = current?.data || null
  const error = current?.error || null
  const impact = impactRes?.key === impactKey ? impactRes.data || null : null
  const impactErr = impactRes?.key === impactKey ? impactRes.error || null : null
  const audit = auditRes?.key === detailKey ? auditRes.audit : undefined // undefined = loading, null = none
  const auditErr = auditRes?.key === detailKey ? auditRes.error || null : null
  const setInterventionId = (ivId) => setPick({ id, interventionId: ivId })
  const loadDetail = () => setReload((n) => n + 1)

  if (error) {
    return (
      <Layout crumb="Merchant 360">
        <div className="pad">
          <ErrorCard title={error.status === 404 ? 'Merchant not found' : 'Unable to load this merchant'} err={error} onRetry={loadDetail} />
        </div>
      </Layout>
    )
  }

  if (!d) {
    return (
      <Layout crumb="Merchant 360">
        <div className="pad mu">Loading merchant intelligence...</div>
      </Layout>
    )
  }

  const m = d.merchant
  const ctx = d.context || {}
  const visits = d.recent_visits || []
  const interventions = d.interventions || []
  const latestVisit = visits[0]
  const latestIv = interventions[0]
  const distance = pos ? haversine(pos, m) : null
  const trend = ctx.transaction_trend_pct
  const scores = (ctx.previous_scores || []).slice().reverse() // oldest → newest
  const shownVisits = showAll ? visits : visits.slice(0, 5)
  const nextAction = audit?.recommended_action && audit.recommended_action !== 'none'
    ? ACTION_LABEL[audit.recommended_action]
    : latestIv?.issue || null
  const startVisit = () => nav(`/fse/mobile?merchant=${m.id}`)

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
              <span className="status-dot-lime" /> {(SOURCE_LABEL[ctx.source] || 'Memory').toUpperCase()}
            </div>
            <h1 style={{ marginTop: 6 }}>{m.name}</h1>
            <p className="mu">
              <MapPin size={13} color="#B7FF3C" /> {m.address || '—'}
              {distance != null ? ` · ${fmtKm(distance)} away` : ''} · {m.category || '—'} · Owner: {m.owner_name || '—'}
              {m.phone ? ` (${m.phone})` : ''} · {m.language || '—'} · FSE: {m.assigned_fse_name || 'Unassigned'}
            </p>
          </div>
          <div className="head-actions">
            <button className="btn" onClick={startVisit}>
              <Navigation size={15} /> Start Visit / Audit
            </button>
            <button
              className="btn p"
              disabled={!latestVisit}
              title={latestVisit ? `Visit #${latestVisit.id}` : 'No visit yet'}
              onClick={() => latestVisit && nav(`/visits/${latestVisit.id}`)}
            >
              Open Latest Visit <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {d.open_escalations?.length > 0 && (
          <div className="card hero-impact">
            <div>
              <span className="pill HIGH"><AlertTriangle size={11} /> OPEN ESCALATION</span>
              {d.open_escalations.map((e) => (
                <p className="sm" key={e.id} style={{ marginTop: 6 }}>
                  Visit #{e.visit_id}: {e.reason} · raised {fmtDate(e.created_at)}
                </p>
              ))}
            </div>
            <button className="btn" onClick={() => nav('/manager')}>Manager review <ArrowRight size={15} /></button>
          </div>
        )}

        {/* Health Stat Cards */}
        <div className="g4 health-stats">
          <StatCard
            label="QR Visibility Score"
            value={m.latest_score == null ? '—' : `${m.latest_score} / 100`}
            note={m.latest_decision ? DECISION_LABEL[m.latest_decision] : 'Not audited yet'}
            up={m.latest_decision === 'compliant'}
          />
          <StatCard
            label="Soundbox Status"
            value={audit == null ? '—' : audit.soundbox_visible ? 'Visible' : 'Not visible'}
            note={audit === undefined ? 'Loading latest audit…' : audit ? `Latest audit · visit #${latestVisit?.id}` : 'No audit yet'}
            up={!!audit?.soundbox_visible}
          />
          <StatCard
            label="Observed Change"
            value={fmtPct(trend)}
            note={trend == null ? 'No measurable intervention yet' : 'Daily transactions, 14 d before vs after'}
            up={trend != null && trend >= 0}
          />
          <StatCard
            label="Competitor Risk"
            value={audit?.competitor || (audit ? 'None seen' : '—')}
            note={audit ? `${DOMINANCE[audit.competitor_dominance] || audit.competitor_dominance || '—'} presence` : 'No audit yet'}
            up={audit ? !audit.competitor || audit.competitor_dominance === 'none' || audit.competitor_dominance === 'low' : false}
          />
        </div>
        {auditErr && <p className="mu sm">Latest audit could not be loaded: {errText(auditErr)}</p>}

        {/* Chart & AI Summary */}
        <div className="g2 merchant-main">
          <section className="card chart-panel">
            <div className="row">
              <div>
                <h2>Transactions Before / After Guidance</h2>
                <span className="mu sm">Observed daily transaction value around the intervention date</span>
              </div>
              <span className="pill ev">Observed change</span>
            </div>
            {impactErr ? (
              <p className="mu sm" style={{ marginTop: 14 }}>Impact could not be loaded: {errText(impactErr)}</p>
            ) : impact ? (
              <ImpactChart data={impact} />
            ) : (
              <p className="mu sm" style={{ marginTop: 14 }}>Loading impact…</p>
            )}
            {interventions.length > 1 && (
              <div className="summary-tags" style={{ marginTop: 10 }}>
                <span className="mu xs" style={{ background: 'none', border: 0, color: 'var(--ink2)' }}>Measure:</span>
                <button className={`filter-chip ${interventionId == null ? 'on' : ''}`} onClick={() => setInterventionId(null)}>
                  Latest measurable
                </button>
                {interventions.map((iv) => (
                  <button key={iv.id} className={`filter-chip ${interventionId === iv.id ? 'on' : ''}`} onClick={() => setInterventionId(iv.id)}>
                    {fmtDate(iv.created_at)} · {iv.issue || ACTION_LABEL[iv.action]}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card ai-summary">
            <div className="row">
              <div>
                <span className="pill ev">{(SOURCE_LABEL[ctx.source] || 'MEMORY RECALL').toUpperCase()}</span>
                <h2 style={{ marginTop: 4 }}>AI Executive Summary</h2>
              </div>
              <Sparkles size={18} color="#B7FF3C" />
            </div>
            <p className="summary-text">{ctx.summary || 'No memory recorded for this merchant yet.'}</p>
            <div className="confidence-box">
              <div className="row">
                <span className="mu sm">LATEST AUDIT CONFIDENCE</span>
                <b className="lime">{audit?.confidence != null ? `${Math.round(audit.confidence * 100)}%` : '—'}</b>
              </div>
              <div className="confidence-bar"><i style={{ width: `${audit?.confidence != null ? Math.round(audit.confidence * 100) : 0}%` }} /></div>
            </div>
            <div className="summary-tags">
              {(ctx.previous_issues || []).slice(0, 3).map((t, i) => <span key={`${t}-${i}`}>{t}</span>)}
              {ctx.consecutive_non_compliant > 0 && <span>{ctx.consecutive_non_compliant} non-compliant in a row</span>}
              {latestIv && <span>Last guidance in {latestIv.message_language || m.language}</span>}
            </div>
          </section>
        </div>

        {/* MERCHANT MEMORY GRAPH */}
        <section className="card memory-card">
          <div className="row">
            <div>
              <span className="pill ev">CONTEXTUAL MEMORY</span>
              <h2 style={{ marginTop: 4 }}>Merchant Memory Graph</h2>
              <p className="mu sm">Visits, issues, interventions, competitors and outcomes linked for this merchant.</p>
            </div>
            <span className="mu sm">LAST VISIT IN MEMORY<br /><b className="lime">{ctx.last_visit_at ? `${fmtDate(ctx.last_visit_at)} · ${fmtTime(ctx.last_visit_at)}` : '—'}</b></span>
          </div>

          <div className="memory-graph-container">
            <div className="m-graph-visual">
              <div className="m-center-node">
                <Brain size={22} color="#FFFFFF" />
                <b>{m.name}</b>
                <span className="mu xs">Merchant ID: {m.id}</span>
              </div>

              <div className="m-nodes-grid">
                <div className="m-node n-visits">
                  <span className="n-tag">VISITS</span>
                  <b>{visits.length} recorded</b>
                  <span className="mu xs">Last: {m.last_visit_at ? fmtDate(m.last_visit_at) : 'never'}</span>
                </div>
                <div className="m-node n-issues">
                  <span className="n-tag red">ISSUES</span>
                  <b>{ctx.previous_issues?.[0] || 'None recorded'}</b>
                  <span className="mu xs">Scores: {scores.length ? scores.join(' → ') : '—'}</span>
                </div>
                <div className="m-node n-interventions">
                  <span className="n-tag lime">INTERVENTIONS</span>
                  <b>{latestIv ? latestIv.issue || ACTION_LABEL[latestIv.action] : 'None yet'}</b>
                  <span className="mu xs">{latestIv ? `${interventions.length} sent · ${latestIv.message_language}` : '—'}</span>
                </div>
                <div className="m-node n-competitors">
                  <span className="n-tag amb">COMPETITOR</span>
                  <b>{audit?.competitor ? `${audit.competitor} ${DOMINANCE[audit.competitor_dominance] || ''}` : audit ? 'None seen' : '—'}</b>
                  <span className="mu xs">{audit ? `Latest audit ${fmtDate(latestVisit?.received_at)}` : 'No audit yet'}</span>
                </div>
                <div className="m-node n-outcomes">
                  <span className="n-tag sky">OUTCOMES</span>
                  <b>{trend == null ? 'Not measurable yet' : `${fmtPct(trend)} observed`}</b>
                  <span className="mu xs">14-day windows</span>
                </div>
              </div>
            </div>

            <div className="memory-events-list">
              <h4>Memory Stream</h4>
              {interventions.length === 0 && <span className="mu sm">No guidance sent yet.</span>}
              {interventions.map((iv) => (
                <div className="memory-item" key={iv.id}>
                  <CheckCircle2 size={14} color="#1F5BFF" />
                  <span className="grow">
                    <b>{iv.issue || ACTION_LABEL[iv.action]}</b>: {iv.message_text}
                    {iv.audio_url && <audio controls preload="none" src={mediaUrl(iv.audio_url)} style={{ display: 'block', height: 28, marginTop: 4 }} />}
                  </span>
                  <span className="mu xs">{fmtDate(iv.created_at)}</span>
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
            {visits.length > 5 && (
              <button className="btn" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show Latest 5' : `View All Records (${visits.length})`}
              </button>
            )}
          </div>

          <div className="data-table">
            <div className="tr th">
              <span>VISIT ID</span>
              <span>DATE</span>
              <span>FSE</span>
              <span>QR SCORE</span>
              <span>AUTHENTICITY</span>
              <span>STATUS</span>
              <span>DECISION</span>
            </div>
            {visits.length === 0 && <div className="tr"><span className="mu">No visits yet</span></div>}
            {shownVisits.map((v) => (
              <div className="tr clickable" key={v.id} onClick={() => nav(`/visits/${v.id}`)}>
                <span className="lime font-mono"><b>#{v.id}</b></span>
                <span>{fmtDate(v.received_at)}</span>
                <span>{v.fse_name}</span>
                <span>
                  {v.qr_visibility_score == null ? '—' : <><span className="qrbar"><i style={{ width: `${v.qr_visibility_score}%` }} /></span> {v.qr_visibility_score} / 100</>}
                </span>
                <span className="lime">{v.authenticity_score == null ? '—' : `${v.authenticity_score} / 100`}</span>
                <span><span className="pill COMPLETED">{STATUS_LABEL[v.status] || v.status}</span></span>
                <span><b>{v.decision ? DECISION_LABEL[v.decision] : '—'}</b></span>
              </div>
            ))}
          </div>
        </section>

        {/* Next Best Action Banner */}
        <div className="card hero-impact">
          <div>
            <span className="pill ev">RECOMMENDED NEXT ACTION</span>
            <h2 style={{ marginTop: 6, color: '#1F5BFF' }}>
              {nextAction ? `${nextAction}: re-check on the next visit` : 'Audit the counter on the next visit'}
            </h2>
            <p className="mu sm" style={{ marginTop: 4 }}>
              The next audit is compared with this merchant memory, and any new guidance gets its own before/after window.
            </p>
          </div>
          <button className="btn p" onClick={startVisit}>
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

.filter-chip { font-size: 11px; background: #EEF3FF; color: var(--lime); padding: 4px 10px; border-radius: 99px; border: 1px solid var(--line); cursor: pointer; }
.filter-chip.on { background: var(--lime); color: #FFFFFF; border-color: var(--lime); }
.pending-strip { margin: 10px 0 0; font-size: 12px; background: #F8FAFF; border: 1px solid var(--line); border-left: 3px solid var(--amb); border-radius: 12px; padding: 8px 12px; color: var(--ink); }
.impact-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
.impact-stats > div { background: #F8FAFF; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
.impact-stats b { font-size: 18px; font-family: Sora; color: var(--ink); }
.impact-stats b.lime { color: var(--lime); }
.impact-stats b.red { color: var(--red); }
.caveat { margin-top: 10px; line-height: 1.5; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hero-impact { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; background: #111515; border: 1px solid var(--line-lime); }
`
