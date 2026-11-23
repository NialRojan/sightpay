import { T } from '../components/Language'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ImageOff,
  MapPin,
  ShieldAlert,
  X,
} from 'lucide-react'
import Layout from '../components/Layout'
import VisitOutcome from '../components/manager/VisitOutcome'
import { getDashboard, getSystemHealth } from '../services/analytics'
import { listEscalations, approveEscalation, rejectEscalation } from '../services/escalations'
import { listFlaggedVisits } from '../services/fraud'
import { listFse, getFseSummary, getFseVisits } from '../services/fse'
import { getVisitDetail, visitPhotoUrl } from '../services/visits'
import { mediaUrl } from '../services/api'
import { getManagerName, setCurrentFse } from '../services/session'
import {
  ACTION_LABEL,
  DECISION_LABEL,
  SIGNAL_LABEL,
  STATUS_LABEL,
  fmtDate,
  fmtInr,
  fmtPct,
  fmtTime,
} from '../services/format'

const TIER_LABEL = { done: 'Verified', pending: 'Pending', high: 'Suspicious' }

// recent_visits[] pin colour: compliant + completed = done, blocked/fraud/rejected = high, everything else pending.
function tierOf(v) {
  if (v.status === 'blocked' || v.decision === 'fraud' || v.status === 'rejected') return 'high'
  if (v.status === 'completed' && v.decision === 'compliant') return 'done'
  return 'pending'
}

const pct = (x) => (x == null ? '—' : `${x}%`)
const errText = (e) => (e ? e.detail || e.message || String(e) : '')

function ErrorLine({ error, what }) {
  if (!error) return null
  return <div className="mg-error" role="alert">Could not load {what}: {errText(error)}</div>
}

export default function Manager() {
  const nav = useNavigate()
  const managerName = getManagerName()

  const [dash, setDash] = useState(null)
  const [dashErr, setDashErr] = useState(null)
  const [escalations, setEscalations] = useState(null)
  const [escErr, setEscErr] = useState(null)
  const [visits, setVisits] = useState({}) // visit_id -> VisitOut (for photo/audit summary/outcome)
  const [flagged, setFlagged] = useState(null)
  const [flagErr, setFlagErr] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthErr, setHealthErr] = useState(null)
  const [team, setTeam] = useState(null)
  const [teamErr, setTeamErr] = useState(null)

  const [drawer, setDrawer] = useState(null) // escalation id
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadEscalations = useCallback(
    () =>
      listEscalations(null) // all statuses; open ones are listed first below
        .then((rows) => {
          setEscalations(rows)
          setEscErr(null)
          return Promise.all(
            rows.map((e) => getVisitDetail(e.visit_id).then((v) => [e.visit_id, v]).catch(() => [e.visit_id, null])),
          )
        })
        .then((details) => setVisits((cur) => ({ ...cur, ...Object.fromEntries(details.filter(([, v]) => v)) })))
        .catch((e) => setEscErr(e)),
    [],
  )

  const loadDash = useCallback(() => getDashboard().then((d) => { setDash(d); setDashErr(null) }).catch((e) => setDashErr(e)), [])
  const loadFlagged = useCallback(() => listFlaggedVisits().then((d) => { setFlagged(d); setFlagErr(null) }).catch((e) => setFlagErr(e)), [])

  const loadTeam = useCallback(
    () =>
      listFse()
        .then((reps) =>
          Promise.all(
            reps.map((r) =>
              Promise.all([getFseSummary(r.id), getFseVisits(r.id, 30)]).then(([summary, recent]) => ({
                ...r,
                summary,
                interventions: recent.filter((v) => v.decision === 'non_compliant').length,
              })),
            ),
          ),
        )
        .then((rows) => {
          setTeam(rows)
          setTeamErr(null)
        })
        .catch((e) => setTeamErr(e)),
    [],
  )

  useEffect(() => {
    loadDash()
    loadEscalations()
    loadFlagged()
    loadTeam()
    getSystemHealth()
      .then((h) => setHealth(h))
      .catch((e) => setHealthErr(e))
  }, [loadDash, loadEscalations, loadFlagged, loadTeam])

  const closeDrawer = useCallback(() => {
    setDrawer(null)
    setNote('')
    setError('')
  }, [])

  const current = useMemo(() => escalations?.find((e) => e.id === drawer) || null, [escalations, drawer])
  const currentVisit = current ? visits[current.visit_id] : null

  const act = async (kind) => {
    if (!current || busy) return
    setBusy(true)
    setError('')
    try {
      const opts = { note: note.trim() || undefined, resolvedBy: managerName }
      const updated = kind === 'approve' ? await approveEscalation(current.id, opts) : await rejectEscalation(current.id, opts)
      const visit = await getVisitDetail(updated.visit_id)
      setEscalations((rows) => rows.map((e) => (e.id === updated.id ? updated : e)))
      setVisits((cur) => ({ ...cur, [visit.id]: visit }))
      setNote('')
      loadDash()
      loadFlagged()
      loadTeam()
    } catch (err) {
      setError(err?.status === 409 ? `Already resolved: ${err.detail}` : errText(err) || 'Action failed. Please try again.')
      if (err?.status === 409) loadEscalations()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!drawer) return
    const onKey = (e) => e.key === 'Escape' && closeDrawer()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, closeDrawer])

  // Map pins: recent_visits[] lat/lng projected into the radar box (relative positions, 8 % padding).
  const pins = useMemo(() => {
    const rows = (dash?.recent_visits || []).filter((v) => v.lat != null && v.lng != null)
    if (!rows.length) return []
    const lats = rows.map((v) => v.lat)
    const lngs = rows.map((v) => v.lng)
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
    const sx = (lng) => (maxLng === minLng ? 50 : 8 + ((lng - minLng) / (maxLng - minLng)) * 84)
    const sy = (lat) => (maxLat === minLat ? 50 : 8 + ((maxLat - lat) / (maxLat - minLat)) * 84)
    return rows.map((v) => ({ v, x: sx(v.lng), y: sy(v.lat), tier: tierOf(v) }))
  }, [dash])

  const summary = useMemo(() => {
    const out = {}
    ;['done', 'pending', 'high'].forEach((t) => {
      const list = pins.filter((p) => p.tier === t)
      out[t] = {
        count: list.length,
        x: list.length ? list.reduce((s, p) => s + p.x, 0) / list.length : 0,
        y: list.length ? list.reduce((s, p) => s + p.y, 0) / list.length : 0,
      }
    })
    return out
  }, [pins])

  const sortedEsc = useMemo(
    () =>
      [...(escalations || [])].sort(
        (a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(b.created_at).localeCompare(String(a.created_at)),
      ),
    [escalations],
  )
  const openCount = sortedEsc.filter((e) => e.status === 'open').length

  const k = dash?.kpis
  const kpis = k
    ? [
        ['Visits today', k.visits_today],
        ['Visits (7d)', k.visits_7d],
        ['Compliance rate (7d)', pct(k.compliance_rate_7d)],
        ['Avg QR score (7d)', k.avg_qr_score_7d ?? '—'],
        ['Avg authenticity (7d)', k.avg_authenticity_7d ?? '—'],
        ['Blocked visits (7d)', k.blocked_7d, k.blocked_7d > 0],
        ['Open escalations', k.open_escalations, k.open_escalations > 0],
        ['Incentives (7d)', fmtInr(k.incentives_inr_7d)],
        ['WhatsApp sent (7d)', k.whatsapp_sent_7d],
        ['Avg observed change', fmtPct(k.avg_observed_change_pct)],
      ]
    : []

  const systems = health
    ? [
        ['Vision AI', health.vision_provider, health.vision_provider !== 'fixture', `Anthropic key ${health.anthropic_key ? 'configured' : 'not set'}`],
        ['n8n Workflow Engine', health.n8n ? 'n8n webhook' : 'Inline pipeline', !!health.n8n, health.n8n ? 'Visits run through n8n' : 'n8n not configured: backend runs the steps'],
        ['Merchant Memory', health.memory, health.memory === 'cognee', health.memory === 'cognee' ? 'Cognee graph (SQL fallback)' : 'SQL memory backend'],
        ['WhatsApp', health.whatsapp, health.whatsapp === 'twilio' && !!health.twilio, health.whatsapp === 'twilio' && health.twilio ? 'Twilio messages' : `Messages logged, not sent · Twilio credentials ${health.twilio ? 'configured' : 'not set'}`],
        ['Sarvam (voice / translation)', health.sarvam ? 'configured' : 'not set', !!health.sarvam, health.sarvam ? 'Translated guidance, voice notes and voice assistant' : 'No key: guidance uses templates, no voice notes'],
        ['Backend API', health.status, health.status === 'ok', 'GET /api/health'],
      ]
    : []
  const liveCount = systems.filter((s) => s[2]).length

  const viewQueue = (rep) => {
    setCurrentFse(rep) // pages that show "the current rep" (queue, dashboard) now show this rep
    nav(`/queue?fse=${rep.id}`)
  }

  const photo = currentVisit ? visitPhotoUrl(currentVisit) : current ? mediaUrl(current.photo_url) : null
  const sig = Object.fromEntries((currentVisit?.authenticity?.signals || []).map((s) => [s.signal, s]))
  const au = currentVisit?.audit

  return (
    <Layout crumb="Command Center">
      <style>{CSS}</style>

      <div className="mg">
        {/* HEADER */}
        <div className="mg-head">
          <div>
            <span className="pill ev">OPERATIONS INTELLIGENCE</span>
            <h1 style={{ marginTop: 6 }}><T>Manager Command Center</T></h1>
            <p className="mu">Monitor field activity, multi-signal evidence, exceptions and automation workflows across regions.</p>
          </div>
          <div className="mg-head-actions">
            <button className="mg-btn" title="Dashboard KPIs cover today and the last 7 days">Last 7 days</button>
            <button className="mg-btn" onClick={() => nav('/login?role=manager')} title="Recorded as resolved_by on approve / reject">
              Approver: {managerName}
            </button>
          </div>
        </div>

        {/* KPIs */}
        <ErrorLine error={dashErr} what="the dashboard" />
        <div className="mg-kpis">
          {!k && !dashErr && <div className="mg-kpi"><span>Loading KPIs…</span><b>…</b></div>}
          {kpis.map(([label, value, warn]) => (
            <div className={`mg-kpi ${warn ? 'warn' : ''}`} key={label}>
              <span>{label}</span>
              <b>{value ?? '—'}</b>
            </div>
          ))}
        </div>

        {/* MAP + EXCEPTIONS */}
        <div className="mg-grid">
          <section className="mg-card">
            <div className="mg-card-head">
              <div>
                <h2>Live Field Coverage & Priority Radar</h2>
                <small>Latest {pins.length} visits by GPS position · click a pin for its evidence</small>
              </div>
              <div className="mg-legend">
                {['done', 'pending', 'high'].map((t) => (
                  <span key={t}><i className={t} />{TIER_LABEL[t]} <b>{summary[t].count}</b></span>
                ))}
              </div>
            </div>

            <div className="mg-map" role="img" aria-label="Field coverage map">
              <div className="mg-scan" />
              {pins.map((p) => (
                <i
                  key={p.v.id}
                  className={`mg-pin ${p.tier}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, cursor: 'pointer' }}
                  title={`${p.v.merchant_name} · ${p.v.fse_name} · ${STATUS_LABEL[p.v.status] || p.v.status}${p.v.decision ? ` · ${DECISION_LABEL[p.v.decision]}` : ''} · ${fmtDate(p.v.received_at)}`}
                  onClick={() => nav(`/visits/${p.v.id}`)}
                />
              ))}
              {summary.high.count > 0 && (
                <div className="mg-callout" style={{ left: `${summary.high.x}%`, top: `${summary.high.y}%` }}>
                  <span>Suspicious</span><b>{summary.high.count}</b>
                </div>
              )}
              {summary.pending.count > 0 && (
                <div className="mg-callout soft" style={{ left: `${summary.pending.x}%`, top: `${summary.pending.y}%` }}>
                  <span>Pending</span><b>{summary.pending.count}</b>
                </div>
              )}
              {dash && !pins.length && <div className="mg-callout soft" style={{ left: '50%', top: '55%' }}><span>No recent visits</span></div>}
            </div>
          </section>

          <section className="mg-card">
            <div className="mg-card-head">
              <div>
                <h2>Exceptions Requiring Attention</h2>
                <small>Escalated visits · {openCount} open, {sortedEsc.length - openCount} resolved</small>
              </div>
              <span className="mg-ico"><ShieldAlert size={17} color="var(--sp-accent)" /></span>
            </div>

            <ErrorLine error={escErr} what="escalations" />
            {!escalations && !escErr && <p className="mu sm">Loading escalations…</p>}
            {escalations && !sortedEsc.length && <p className="mu sm">No escalations: every analysed visit was decided automatically.</p>}

            <div className="mg-ex-list" style={{ maxHeight: 380, overflowY: 'auto' }}>
              {sortedEsc.map((e) => {
                const v = visits[e.visit_id]
                const img = mediaUrl(e.photo_url)
                const open = e.status === 'open'
                return (
                  <div className="mg-ex" key={e.id} data-testid={`escalation-${e.id}`}>
                    <span className={`mg-ex-ico ${open ? 'warn' : ''}`} style={img ? { overflow: 'hidden', padding: 0 } : undefined}>
                      {img ? (
                        <img src={img} alt={`Visit ${e.visit_id} photo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <AlertTriangle size={15} />
                      )}
                    </span>
                    <div className="mg-ex-body">
                      <span className={`mg-ex-type ${open ? 'warn' : ''}`}>{e.status.toUpperCase()} · {e.reason}</span>
                      <b>{e.merchant_name}</b>
                      <span>
                        Rep {e.fse_name} · Authenticity {e.authenticity_score ?? '—'}
                        {v?.authenticity?.verdict ? ` ${v.authenticity.verdict}` : ''} · QR {e.qr_visibility_score ?? '—'} · Confidence{' '}
                        {e.confidence == null ? '—' : `${Math.round(e.confidence * 100)}%`}
                      </span>
                      <small className="mu">
                        {v?.audit
                          ? `Vision: ${ACTION_LABEL[v.audit.recommended_action] || v.audit.recommended_action} · image ${v.audit.image_quality}${v.audit.notes ? ` · ${v.audit.notes}` : ''}`
                          : 'Vision audit loading…'}
                        {!open && v ? ` → ${STATUS_LABEL[v.status] || v.status}${v.decision ? `, ${DECISION_LABEL[v.decision]}` : ''}` : ''}
                      </small>
                    </div>
                    <button className="mg-btn" onClick={() => setDrawer(e.id)}>
                      {open ? 'Review' : 'Outcome'} <ChevronRight size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* FLAGGED VISITS */}
        <section className="mg-card">
          <div className="mg-card-head">
            <div>
              <h2>Flagged & Blocked Visits</h2>
              <small>Visits whose combined evidence signals need review or failed (GET /fraud/flagged)</small>
            </div>
            <span className="mg-pill">{flagged ? `${flagged.length} flagged` : '…'}</span>
          </div>
          <ErrorLine error={flagErr} what="flagged visits" />
          {!flagged && !flagErr && <p className="mu sm">Loading flagged visits…</p>}
          {flagged && !flagged.length && <p className="mu sm">No flagged visits: every visit passed the authenticity checks.</p>}
          <div className="mg-ex-list">
            {(flagged || []).map((v) => (
              <div className="mg-ex" key={v.id}>
                <span className={`mg-ex-ico ${v.verdict === 'BLOCKED' ? 'warn' : ''}`}><ShieldAlert size={15} /></span>
                <div className="mg-ex-body">
                  <span className={`mg-ex-type ${v.verdict === 'BLOCKED' ? 'warn' : ''}`}>{v.verdict}</span>
                  <b>{v.merchant_name}</b>
                  <span>
                    Visit #{v.id} · Rep {v.fse_name} · Authenticity {v.authenticity_score ?? '—'} · {STATUS_LABEL[v.status] || v.status}
                    {v.decision ? ` · ${DECISION_LABEL[v.decision]}` : ''}
                  </span>
                  <small className="mu">{fmtDate(v.received_at)} {fmtTime(v.received_at)}</small>
                </div>
                <Link className="mg-btn" to={`/visits/${v.id}`}>
                  <T>Evidence</T> <ChevronRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FSE TABLE */}
        <section className="mg-card">
          <div className="mg-card-head">
            <div>
              <h2>FSE Operational Coverage</h2>
              <small>Field execution visibility & evidence compliance monitoring · click a rep to open their queue</small>
            </div>
            <span className="mg-pill">Last 30 days</span>
          </div>

          <ErrorLine error={teamErr} what="team overview" />
          <div className="mg-table-wrap">
            <div className="mg-table">
              <div className="mg-tr head">
                {['FSE NAME', 'ASSIGNED', 'VERIFIED', 'INTERVENTIONS', 'COVERAGE %', 'EXCEPTIONS'].map((h) => <span key={h}>{h}</span>)}
              </div>
              {!team && !teamErr && <div className="mg-tr"><span className="mu">Loading reps…</span></div>}
              {(team || []).map((r) => {
                const c = r.summary.coverage
                const p = r.summary.performance
                const exceptions = sortedEsc.filter((e) => e.status === 'open' && e.fse_name === r.name).length
                return (
                  <div className="mg-tr" key={r.id}>
                    <span className="name">
                      <a
                        href={`/queue?fse=${r.id}`}
                        onClick={(ev) => { ev.preventDefault(); viewQueue(r) }}
                        style={{ color: '#1F5BFF' }}
                        title={`Open ${r.name}'s priority queue`}
                      >
                        {r.name}
                      </a>
                      <small className="mu" style={{ display: 'block', fontWeight: 400 }}>{r.territory} · {p.visits} visits</small>
                    </span>
                    <span>{c.assigned}</span>
                    <span>{pct(p.verified_pct)}</span>
                    <span title="Non-compliant visits that sent merchant guidance">{r.interventions}</span>
                    <span>
                      {pct(c.coverage_pct)} <small className="mu">({c.visited}/{c.assigned})</small>
                      <u><i style={{ width: `${Math.min(100, c.coverage_pct || 0)}%` }} /></u>
                    </span>
                    <span>{exceptions > 0 ? <em className="mg-alert">{exceptions}</em> : 0}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* AUTOMATION HEALTH */}
        <section className="mg-card">
          <div className="mg-card-head">
            <div>
              <h2>System Architecture & Automation Health</h2>
              <small>Configured providers from GET /api/health (configuration, not uptime)</small>
            </div>
            <span className="mg-pill">{health ? `${liveCount} / ${systems.length} live providers` : '…'}</span>
          </div>
          <ErrorLine error={healthErr} what="system health" />
          <div className="mg-systems">
            {systems.map(([name, value, live, detail]) => (
              <div key={name}>
                <span className="mg-sysdot" style={live ? undefined : { background: '#9AA8C7', boxShadow: 'none' }} />
                <b>{name}</b>
                <small className="lime">{String(value)}</small>
                <small className="mu">{detail}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* REVIEW DRAWER */}
      {current && (
        <div className="mg-backdrop" onClick={closeDrawer}>
          <aside className="mg-drawer card" role="dialog" aria-modal="true" aria-labelledby="mg-drawer-title" onClick={(e) => e.stopPropagation()}>
            <div className="mg-drawer-head">
              <div>
                <span className="pill ev">EXCEPTION AUDIT · {current.status.toUpperCase()}</span>
                <h2 id="mg-drawer-title" style={{ marginTop: 4 }}>{current.merchant_name}</h2>
                <span className="mu sm">
                  Escalation #{current.id} · <Link to={`/visits/${current.visit_id}`} style={{ color: '#1F5BFF' }}>Visit #{current.visit_id}</Link> · Rep {current.fse_name} · {fmtDate(current.created_at)} {fmtTime(current.created_at)}
                </span>
              </div>
              <button className="mg-close" onClick={closeDrawer} aria-label="Close review"><X size={18} /></button>
            </div>

            <div className="mg-dsec">
              <b>Visit photo</b>
              {photo ? (
                <img src={photo} alt={`Visit ${current.visit_id}`} style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 14, border: '1px solid #DDE7FB' }} />
              ) : (
                <div className="mg-evidence"><span><ImageOff size={15} /> No photo: historical visit</span></div>
              )}
            </div>

            <div className="mg-dsec">
              <b>Multi-Signal Visit Evidence</b>
              <div className="mg-evidence">
                <span><MapPin size={15} color="#1F5BFF" /> {SIGNAL_LABEL.gps}: {sig.gps?.detail || '—'}</span>
                <span><CheckCircle2 size={15} color="#1F5BFF" /> Image quality: {au?.image_quality || '—'}</span>
                <span>
                  <ShieldAlert size={15} color={au && au.confidence < 0.6 ? '#FF6B5F' : '#1F5BFF'} /> Vision confidence:{' '}
                  {au?.confidence == null ? '—' : `${Math.round(au.confidence * 100)}%`}
                </span>
                <span><Clock3 size={15} color="#1F5BFF" /> {SIGNAL_LABEL.duplicate_image}: {sig.duplicate_image?.detail || '—'}</span>
                <span>
                  <ShieldAlert size={15} color={currentVisit?.authenticity?.verdict === 'VERIFIED' ? '#1F5BFF' : '#FF6B5F'} /> Authenticity:{' '}
                  {currentVisit?.authenticity ? `${currentVisit.authenticity.score} ${currentVisit.authenticity.verdict}` : current.authenticity_score ?? '—'}
                </span>
                <span><CheckCircle2 size={15} color="#1F5BFF" /> QR visibility: {au?.qr_visibility_score ?? current.qr_visibility_score ?? '—'}/100</span>
              </div>
              {(currentVisit?.authenticity?.signals || []).some((s) => s.status !== 'pass') && (
                <p className="mu sm" style={{ marginTop: 8 }}>
                  {currentVisit.authenticity.signals.filter((s) => s.status !== 'pass').map((s) => `${SIGNAL_LABEL[s.signal] || s.signal} −${s.penalty} (${s.detail})`).join(' · ')}
                </p>
              )}
            </div>

            <div className="mg-dsec">
              <b>Vision Audit Summary</b>
              <p className="mu sm">
                <strong>Escalation reason:</strong> {current.reason}
                <br />
                {au ? (
                  <>
                    Recommended: {ACTION_LABEL[au.recommended_action] || au.recommended_action} · Paytm QR {au.paytm_qr_visible ? 'visible' : 'not visible'}
                    {au.qr_obstructed ? ' (obstructed)' : ''} · Soundbox {au.soundbox_visible ? 'visible' : 'not visible'} · Competitor{' '}
                    {au.competitor ? `${au.competitor} (${au.competitor_dominance})` : 'none'} · Provider {au.provider}
                    {au.notes ? <><br />{au.notes}</> : null}
                  </>
                ) : currentVisit === undefined ? 'Loading vision audit…' : 'No vision audit for this visit.'}
              </p>
              {current.status === 'open' && au && (
                <p className="mu sm" style={{ marginTop: 6 }}>
                  {au.recommended_action === 'retake_photo'
                    ? 'Approving an unusable photo completes the visit with no automated action.'
                    : 'Approving applies the real decision: compliant → ₹50 incentive, non-compliant → merchant guidance + WhatsApp.'}
                </p>
              )}
            </div>

            <VisitOutcome escalation={current} visit={currentVisit} />

            {current.status === 'open' && (
              <label className="mg-note">
                <span>Manager Review Note</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Enter audit review comments..." rows={4} />
              </label>
            )}

            {error && <div className="mg-error" role="alert">{error}</div>}

            {current.status === 'open' && (
              <div className="mg-drawer-actions">
                <button className="mg-btn" disabled={busy} onClick={() => act('reject')}>Reject Visit</button>
                <button className="mg-btn" disabled={busy} onClick={() => act('approve')}>Approve Exception</button>
                <button className="mg-btn primary" disabled title="No backend endpoint: approve or reject here">Escalate to Regional</button>
              </div>
            )}
            {busy && <p className="mu sm">Applying decision as {managerName}…</p>}
          </aside>
        </div>
      )}
    </Layout>
  )
}

const CSS = `
.mg{--ink:#0A1B3D;--ink2:#5B6E96;--line:#DDE7FB;--lime:#1F5BFF;--navy:#0B2A8A;--mist:#EEF3FF;
  display:grid;gap:14px;padding:4px 2px 28px;color:var(--ink)}
.mg *{box-sizing:border-box}
.mg h1,.mg h2{margin:0;font-family:Sora,sans-serif;letter-spacing:-.025em;color:#0A1B3D}
.mg p{margin:0}

.mg-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:6px 4px 4px}
.mg-head h1{font-size:clamp(26px,3vw,36px);font-weight:700;line-height:1.1}
.mg-head p{margin-top:6px;font-size:14px;color:var(--ink2)}
.mg-head-actions{display:flex;gap:8px}

.mg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:999px;cursor:pointer;background:var(--mist);color:var(--lime);
  border:1px solid var(--line);font:600 13px Inter,sans-serif;transition:.16s;white-space:nowrap}
.mg-btn:hover:not(:disabled){border-color:var(--lime);color:var(--navy);background:#E3EDFF}
.mg-btn:disabled{opacity:.55;cursor:not-allowed}
.mg-btn.primary{background:var(--lime);border-color:var(--lime);color:#FFFFFF;font-weight:700}
.mg-btn.primary:hover:not(:disabled){background:#174FE0;color:#FFFFFF}

.mg-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.mg-kpi{position:relative;padding:18px 20px;border-radius:20px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 30px -10px rgba(10,27,61,0.06);overflow:hidden}
.mg-kpi span{display:block;font-size:12px;color:var(--ink2);font-weight:600}
.mg-kpi b{display:block;margin-top:8px;font:700 30px/1 Sora,sans-serif;color:var(--ink)}
.mg-kpi.warn b{color:var(--lime)}

.mg-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:14px}
@media(max-width:1100px){.mg-grid{grid-template-columns:1fr}}

.mg-card{padding:22px;border-radius:22px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 30px -10px rgba(10,27,61,0.06);min-width:0}
.mg-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.mg-card-head h2{font-size:17px;font-weight:600;color:#0A1B3D}
.mg-card-head small{display:block;margin-top:4px;font-size:12px;color:var(--ink2)}
.mg-ico{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--mist);color:var(--lime);border:1px solid var(--line)}
.mg-pill{display:inline-block;padding:5px 12px;border-radius:99px;background:var(--mist);color:var(--lime);font-size:11px;font-weight:700;border:1px solid var(--line)}

.mg-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--ink2)}
.mg-legend span{display:flex;align-items:center;gap:6px}
.mg-legend b{color:var(--ink)}
.mg-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;border:1px solid var(--lime)}
.mg-legend i.done{background:var(--lime)}
.mg-legend i.pending{background:#1F5BFF}
.mg-legend i.high{background:#DC2626}

.mg-map{position:relative;height:380px;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#EEF3FF}
.mg-scan{position:absolute;top:0;bottom:0;width:120px;left:-120px;background:linear-gradient(90deg,transparent,rgba(31,91,255,0.08),transparent);border-right:1px solid rgba(31,91,255,0.2);animation:mgScan 8s linear infinite}
.mg-pin{position:absolute;width:12px;height:12px;transform:translate(-50%,-50%);border-radius:50%;background:var(--lime);box-shadow:0 0 10px var(--lime)}
.mg-pin.high{background:#DC2626;box-shadow:0 0 10px #DC2626}
.mg-pin.pending{background:#1F5BFF;box-shadow:0 0 10px #1F5BFF}
.mg-callout{position:absolute;transform:translate(-50%,-140%);display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:99px;background:#FEE2E2;color:#DC2626;font-size:11px;font-weight:800;pointer-events:none}
.mg-callout.soft{background:#EEF3FF;color:var(--lime);border:1px solid var(--line)}

.mg-ex-list{display:grid;gap:10px}
.mg-ex{display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;background:#F8FAFF;border:1px solid var(--line)}
.mg-ex-ico{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#EEF3FF;color:var(--lime)}
.mg-ex-ico.warn{color:#DC2626;background:#FEE2E2}
.mg-ex-body{flex:1;min-width:0;display:grid;gap:2px}
.mg-ex-body b{font-size:14px;color:var(--ink)}
.mg-ex-body span{font-size:12px;color:var(--ink2)}
.mg-ex-type{justify-self:start;padding:2px 8px;border-radius:99px;background:#EEF3FF;color:var(--lime);font-size:10px;font-weight:800}

.mg-table-wrap{overflow-x:auto}
.mg-table{min-width:640px}
.mg-tr{display:grid;grid-template-columns:1.6fr repeat(5,1fr);gap:12px;align-items:center;padding:12px 10px;border-bottom:1px solid var(--line);font-size:13px}
.mg-tr.head{display:grid;margin-bottom:0;font-size:11px;font-weight:700;color:var(--ink2)} /* .sp .head (flex) would override the grid */
.mg-tr .name{font-weight:600}
.mg-tr u{display:block;height:4px;margin-top:4px;border-radius:99px;background:#EEF3FF;overflow:hidden;text-decoration:none}
.mg-tr u i{display:block;height:100%;border-radius:99px;background:var(--lime)}
.mg-alert{display:inline-block;padding:2px 8px;border-radius:99px;background:#FEE2E2;color:#DC2626;font:800 11px Inter,sans-serif}

.mg-systems{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.mg-systems div{display:grid;gap:4px;padding:14px;border-radius:16px;background:#F8FAFF;border:1px solid var(--line)}
.mg-systems b{font-size:13px;color:#0A1B3D}
.mg-sysdot{width:8px;height:8px;border-radius:50%;background:var(--lime);box-shadow:0 0 8px var(--lime)}

.mg-backdrop{position:fixed;inset:0;z-index:100;display:flex;justify-content:flex-end;background:rgba(10,27,61,0.4);backdrop-filter:blur(4px)}
.mg-drawer{width:min(460px,100%);height:100%;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px;background:#FFFFFF;border-left:1px solid var(--line)}
.mg-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.mg-close{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;cursor:pointer;background:var(--mist);color:var(--ink2)}
.mg-dsec b{display:block;font-size:13px;margin-bottom:8px;color:#0A1B3D}
.mg-evidence{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mg-evidence span{display:flex;align-items:center;gap:8px;padding:10px;border-radius:12px;background:var(--mist);border:1px solid var(--line);font-size:11px;color:var(--ink)}
.mg-note textarea{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:#FFFFFF;color:var(--ink);font:400 13px Inter,sans-serif;outline:0}
.mg-drawer-actions{display:flex;gap:10px;margin-top:auto}
.mg-error{padding:10px 12px;border-radius:12px;background:#FEE2E2;color:#DC2626;font-size:12.5px}

@keyframes mgScan{to{transform:translateX(100vw)}}
`