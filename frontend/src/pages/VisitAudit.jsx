import { T } from '../components/Language'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Image as ImageIcon, MapPin, Play, RefreshCw, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import Layout from '../components/Layout'
import { PriorityBadge } from '../components/ui'
import { visitPhotoUrl } from '../services/visits'
import { mediaUrl } from '../services/api'
import { textToSpeech } from '../services/voice'
import { fmtDate, fmtInr, fmtTime, NOTIFICATION_LABEL, STEP_LABEL } from '../services/format'
import { useVisitEvidence, errorText } from '../components/visit/useVisitEvidence'
import {
  actionLabel, auditChecks, BAD_STEPS, decisionLabel, guidanceEngine, langLabel, reuseLabel, signalLabel,
  signalsByName, statusLabel, statusPill, suspiciousOf, uniqueSteps, VERDICT_LABEL,
} from '../components/visit/evidence'

const ANALYZABLE = ['submitted', 'failed']
// gps signal detail is "0 m from merchant (limit 100 m)": keep the distance for the compact stat tile.
const gpsDistance = (detail = '') => detail.split(' from ')[0] || detail

export default function VisitAudit() {
  const { id } = useParams()
  const nav = useNavigate()
  const { visit: v, fraud, fraudError, error, loading, busy, actionError, runAnalysis } = useVisitEvidence(id)
  const [toast, setToast] = useState(null)
  const [voice, setVoice] = useState({ url: null, loading: false })

  const flash = (text) => { setToast(text); setTimeout(() => setToast(null), 4200) }

  if (loading) return <Layout crumb="Visit Audit"><div className="pad mu">Loading visit evidence…</div></Layout>
  if (error || !v) {
    return (
      <Layout crumb="Visit Audit">
        <div className="pad">
          <div className="card">
            <h2>Visit #{id} could not be loaded</h2>
            <p className="mu">{errorText(error) || 'No data returned.'}</p>
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-start', gap: 10 }}>
              <button className="btn" onClick={() => window.location.reload()}><RefreshCw size={15} /> <T>Retry</T></button>
              <button className="btn" onClick={() => nav('/fse/audits')}><T>AI Audits</T></button>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const audit = v.audit
  const auth = fraud || v.authenticity || {}
  const signals = auth.signals || []
  const byName = signalsByName(signals)
  const checks = auditChecks(audit)
  const score = audit ? Math.round(audit.qr_visibility_score ?? 0) : null
  const penalties = signals.reduce((s, x) => s + (x.penalty || 0), 0)
  const log = v.pipeline_log || []
  const steps = uniqueSteps(log)
  const actions = v.actions || {}
  const iv = actions.intervention
  const notes = actions.notifications || []
  const inc = actions.incentive
  const esc = actions.escalation
  const engine = guidanceEngine(log)
  const suspicious = suspiciousOf(audit)
  const photo = visitPhotoUrl(v)
  const analyzing = v.status === 'analyzing' || busy
  const canAnalyze = ANALYZABLE.includes(v.status) && !busy
  const verdict = auth.verdict

  const playVoice = async () => {
    if (!iv) return flash('No merchant guidance on this visit.')
    if (iv.audio_url) return setVoice({ url: mediaUrl(iv.audio_url), loading: false })
    setVoice({ url: null, loading: true })
    try {
      const r = await textToSpeech(iv.message_text, iv.message_language)
      setVoice({ url: mediaUrl(r.audio_url), loading: false })
    } catch (e) {
      setVoice({ url: null, loading: false })
      flash(e?.status === 503 ? `Voice needs a Sarvam key (${e.detail})` : `Voice preview failed: ${errorText(e)}`)
    }
  }

  const decisionTitle = v.decision
    ? `${decisionLabel(v.decision)}${audit && audit.recommended_action && audit.recommended_action !== 'none' ? `: ${actionLabel(audit.recommended_action)}` : ''}`
    : statusLabel(v.status)
  const decisionText = (v.decision_reasons || []).join(' · ') ||
    (v.status === 'submitted' ? 'Photo uploaded, not analyzed yet. Run analysis to get the Vision AI audit and decision.'
      : analyzing ? 'The pipeline is running; this page updates live.' : 'No decision reasons recorded.')

  return (
    <Layout crumb="Visit Audit">
      <style>{`
        .va-crumb{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink2,#929A94);margin-bottom:16px}
        .va-crumb span{cursor:pointer}.va-crumb span:hover{color:var(--sp-accent)}
        .va-crumb b{font-weight:400;opacity:.5}

        .va-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px;flex-wrap:wrap}
        .va-eyebrow{font-size:11px;color:var(--sp-accent);font-weight:700;letter-spacing:0.05em;margin-bottom:4px}
        .va-head h1{font-family:Sora,sans-serif;font-size:28px;font-weight:700;letter-spacing:-.02em;color:var(--ink,#F5F7F4)}
        .va-head-actions{display:flex;align-items:center;gap:10px}
        .va-verified{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--sp-accent);background:var(--sp-success-bg);border:1px solid var(--sp-success-line);border-radius:999px;padding:6px 14px}

        .va-vrow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
        .va-vchip{display:inline-flex;align-items:center;gap:6px;background:var(--mist);border:1px solid var(--line);border-radius:999px;padding:7px 12px 7px 8px;font-size:12px}
        .va-vchip .ok{width:18px;height:18px;border-radius:999px;background:var(--sp-success-bg);color:var(--sp-accent);display:grid;place-items:center;flex-shrink:0}
        .va-vchip span{color:var(--ink2,#929A94)}
        .va-vchip b{color:var(--ink);font-weight:600}

        /* HERO */
        .va-hero{padding:0;overflow:hidden;margin-bottom:14px;background:var(--card);border:1px solid var(--line)}
        .va-hero-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:0}
        @media (max-width:900px){.va-hero-grid{grid-template-columns:1fr}}

        .va-hero-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:0}
        @media (max-width:900px){.va-hero-grid{grid-template-columns:1fr}}

        .va-photo{
          position:relative;min-height:300px;
          background:linear-gradient(165deg,#EEF3FF,#F4F7FF);
          border-right:1px solid #DDE7FB;
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
          padding:24px;
        }
        @media (max-width:900px){.va-photo{border-right:0;border-bottom:1px solid #DDE7FB}}

        .va-chip-float{position:absolute;top:16px;left:16px;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#1F5BFF;background:rgba(255,255,255,.9);border:1px solid rgba(31,91,255,0.25);border-radius:999px;padding:6px 12px}

        .va-score{width:128px;height:128px;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 30px rgba(31,91,255,0.2);background:#EEF3FF}
        .va-score-inner{width:98px;height:98px;border-radius:50%;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(10,27,61,0.06)}
        .va-score-inner b{font-family:Sora,sans-serif;font-size:30px;line-height:1;color:#1F5BFF}
        .va-score-inner span{font-size:11px;color:#5B6E96;margin-top:3px}

        .va-detect-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
        .va-detect-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;background:#FFFFFF;border:1px solid #DDE7FB}
        .va-detect-chip.pass{color:#1F5BFF;border-color:rgba(31,91,255,0.3)}
        .va-detect-chip.fail{color:#5B6E96}

        .va-side{padding:22px 24px;display:flex;flex-direction:column}
        .va-side-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
        .va-side-head h2{font-size:16px;color:#0A1B3D}

        .va-check{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
        .va-check-row{display:flex;flex-direction:column;gap:5px}
        .va-check-top{display:flex;align-items:center;justify-content:space-between;font-size:13px}
        .va-check-label{display:flex;align-items:center;gap:8px;color:#0A1B3D}
        .va-check-label .dot{width:18px;height:18px;border-radius:999px;display:grid;place-items:center;flex-shrink:0}
        .va-check-label .dot.pass{background:#1F5BFF;color:#FFFFFF}
        .va-check-label .dot.fail{background:#EEF3FF;color:#5B6E96}
        .va-check-top b{font-size:12px;color:#5B6E96;font-weight:600}
        .va-check-bar{height:5px;border-radius:99px;background:#EEF3FF;overflow:hidden}
        .va-check-bar i{display:block;height:100%;border-radius:99px;background:#1F5BFF}

        .va-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
        .va-stat{background:#EEF3FF;border:1px solid #DDE7FB;border-radius:14px;padding:8px 12px;display:flex;flex-direction:column;gap:2px;flex:1;min-width:110px}
        .va-stat span{font-size:10px;color:#5B6E96}
        .va-stat b{font-size:13px;color:#0A1B3D;display:flex;align-items:center;gap:5px}

        .va-decision-bar{
          grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
          padding:18px 24px;background:#EEF3FF;border-top:1px solid #DDE7FB;color:#0A1B3D;
        }
        .va-decision-bar p{font-size:13px;color:#5B6E96}
        .va-decision-bar b{font-family:Sora,sans-serif;font-size:15px;color:#1F5BFF;display:block;margin-bottom:2px}
        .va-decision-bar .btn.p{background:#1F5BFF;color:#FFFFFF;font-weight:700}

        /* LOWER ROW */
        .va-lower{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;margin-bottom:14px}
        @media (max-width:900px){.va-lower{grid-template-columns:1fr}}

        .va-chain{display:flex;flex-direction:column;gap:0;margin-top:12px}
        .va-chain-item{display:flex;gap:12px;align-items:flex-start;position:relative;padding-bottom:16px}
        .va-chain-item:last-child{padding-bottom:0}
        .va-chain-item>div:last-of-type{display:flex;flex-direction:column;gap:1px}
        .va-chain-item b{font-size:13px;color:#0A1B3D}
        .va-chain-item span{font-size:12px;color:#5B6E96}
        .va-chain-dot{width:22px;height:22px;border-radius:999px;background:#1F5BFF;color:#FFFFFF;display:grid;place-items:center;flex-shrink:0;z-index:1;font-weight:800}
        .va-chain-line{position:absolute;left:11px;top:22px;bottom:0;width:1px;background:#DDE7FB}

        .va-auth-top{display:flex;align-items:center;gap:14px;margin:12px 0 14px}
        .va-auth-top b{font-family:Sora,sans-serif;font-size:32px;color:#1F5BFF}
        .va-auth-top span{font-size:12px;color:#5B6E96}
        .va-signals{display:grid;gap:7px;margin-bottom:12px}
        .va-signals div{display:flex;justify-content:space-between;font-size:12px;color:#5B6E96}
        .va-signals b{color:#1F5BFF;font-weight:700}
        .va-auth-note{font-size:12px;color:#5B6E96;line-height:1.5}

        .va-pipe{display:flex;align-items:center;gap:4px;overflow-x:auto;padding:14px 0 16px;margin-bottom:14px;border-bottom:1px solid #DDE7FB}
        .va-pipe-step{display:flex;align-items:center;gap:6px;flex-shrink:0;font-size:12px;color:#5B6E96}
        .va-pipe-step .dot{width:20px;height:20px;border-radius:999px;background:#1F5BFF;color:#FFFFFF;display:grid;place-items:center;flex-shrink:0;font-weight:800}
        .va-pipe-step b{color:#0A1B3D;font-weight:600}

        .va-message{background:#EEF3FF;border:1px solid #DDE7FB;border-radius:16px;padding:14px 16px;margin-bottom:14px}
        .va-message p{font-size:14px;color:#0A1B3D;line-height:1.6}

        .va-toast{
          position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100;
          display:flex;align-items:center;gap:10px;background:#FFFFFF;color:#0A1B3D;
          border-radius:999px;padding:10px 18px;font-size:13px;border:1px solid #1F5BFF;
          box-shadow:0 16px 40px -14px rgba(10,27,61,0.15);
        }
      `}</style>
      <div className="pad">
        <div className="va-crumb">
          <Link to="/queue"><T>Priority Queue</T></Link><b aria-hidden="true">/</b>
          <Link to={`/merchants/${v.merchant_id}`}>{v.merchant_name}</Link><b aria-hidden="true">/</b>
          <span>Visit Audit #{v.id}</span>
        </div>

        <div className="va-head">
          <div>
            <h1><T>Visit Audit & Verification</T></h1>
            <p className="mu top16">
              <Link to={`/merchants/${v.merchant_id}`} style={{ color: 'inherit' }}>{v.merchant_name}</Link>
              {' · '}Received {fmtDate(v.received_at)} · {fmtTime(v.received_at)}
              {' · '}Captured {v.captured_at ? `${fmtDate(v.captured_at)} · ${fmtTime(v.captured_at)}` : 'time not sent'}
              {' · '}FSE {v.fse_name}
            </p>
            <p className="mu sm" style={{ marginTop: 6 }}>
              <span className={`pill ${statusPill(v.status)}`}>{statusLabel(v.status)}</span>
              {' '}Capture: {v.capture_source || '—'} · Pipeline: {v.pipeline_mode || '—'}
              {v.completed_at ? ` · Finished ${fmtTime(v.completed_at)}` : ''}
            </p>
          </div>
          <div className="va-head-actions">
            {verdict && (
              <span className="va-verified">
                {verdict === 'VERIFIED' ? <Check size={14} /> : <AlertTriangle size={14} />} {VERDICT_LABEL[verdict] || verdict}
              </span>
            )}
            <button className="btn" onClick={runAnalysis} disabled={!canAnalyze}
              title={canAnalyze ? 'POST /visits/{id}/analyze' : 'Only submitted or failed visits can be analyzed'}>
              <RefreshCw size={15} />{' '}
              {analyzing ? 'Analyzing…' : v.status === 'submitted' ? 'Run analysis' : v.status === 'failed' ? 'Retry analysis' : 'Analysis complete'}
            </button>
          </div>
        </div>

        {actionError && (
          <div className="card" style={{ marginBottom: 14 }}>
            <b className="red">Analysis failed</b> <span className="mu sm">{errorText(actionError)}</span>
          </div>
        )}

        <div className="va-vrow">
          {signals.map((s) => (
            <div className="va-vchip" key={s.signal} title={s.detail}>
              {s.status === 'pass' && <span className="ok"><Check size={11} /></span>}
              <span>{signalLabel(s.signal)}</span><b>{s.status.toUpperCase()}{s.penalty ? ` (−${s.penalty})` : ''}</b>
            </div>
          ))}
          {!signals.length && (
            <div className="va-vchip"><span>Evidence signals</span><b>{v.status === 'submitted' ? 'Not checked yet' : 'Not recorded (historical visit)'}</b></div>
          )}
          <div className="va-vchip">
            <span>Authenticity</span><b>{auth.score != null ? `${auth.score}/100` : '—'}{verdict ? ` ${verdict}` : ''}</b>
          </div>
        </div>

        {/* HERO: photo + score + checklist + decision */}
        <section className="card va-hero">
          <div className="va-hero-grid">
            <div className="va-photo">
              <div className="va-chip-float"><ImageIcon size={13} /> {reuseLabel(signals)}</div>

              {photo ? (
                <img src={photo} alt={`Counter photo at ${v.merchant_name}`}
                  style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 14, marginTop: 28 }} />
              ) : (
                <div className="va-detect-chip fail" style={{ marginTop: 28 }}><ImageIcon size={12} /> No photo: historical visit</div>
              )}

              <div className="va-score" style={{ background: `conic-gradient(var(--blue) ${(score ?? 0) * 3.6}deg, var(--line) 0deg)` }}>
                <div className="va-score-inner">
                  <b>{score ?? '—'}</b>
                  <span>of 100</span>
                </div>
              </div>

              <div className="va-detect-row">
                {checks.filter((c) => c.key !== 'score').map((c) => (
                  <span className={`va-detect-chip ${c.pass ? 'pass' : 'fail'}`} key={c.key}>
                    {c.pass ? <Check size={12} /> : <X size={12} />} {c.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="va-side">
              <div className="va-side-head">
                <h2><T>Counter Vision Rubric</T></h2>
                <Sparkles size={16} color="var(--blue)" />
              </div>
              <span className="mu sm">
                {audit ? `${score} of 100 QR visibility score — evaluated by Vision AI (${audit.provider || 'unknown provider'})`
                  : analyzing ? 'Vision AI is analyzing the photo…' : 'No Vision AI audit yet'}
              </span>

              <div className="va-check">
                {checks.map((c) => (
                  <div className="va-check-row" key={c.key}>
                    <div className="va-check-top">
                      <span className="va-check-label">
                        <span className={`dot ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? <Check size={11} /> : <X size={11} />}</span>
                        {c.label}
                      </span>
                      <b>{c.value}</b>
                    </div>
                    <div className="va-check-bar"><i style={{ width: `${c.pct || 4}%` }} /></div>
                  </div>
                ))}
                {audit?.notes && <span className="mu sm">Notes: {audit.notes}</span>}
                {suspicious.length > 0 && <span className="mu sm">Suspicious signals: {suspicious.join(', ')}</span>}
              </div>

              <div className="va-stats">
                <div className="va-stat"><span>Vision Confidence</span><b>{audit?.confidence != null ? `${Math.round(audit.confidence * 100)}%` : '—'}</b></div>
                <div className="va-stat"><span>Geofence Proximity</span><b><MapPin size={12} /> {byName.gps ? `${gpsDistance(byName.gps.detail)} (${byName.gps.status})` : '—'}</b></div>
                <div className="va-stat">
                  <span>Competitor</span>
                  <b>{audit?.competitor || 'None'} {audit?.competitor && audit.competitor_dominance && (
                    <PriorityBadge level={audit.competitor_dominance.toUpperCase()} />
                  )}</b>
                </div>
              </div>
            </div>

            <div className="va-decision-bar">
              <div>
                <b>{decisionTitle}</b>
                <p>{decisionText}</p>
              </div>
              <button className="btn p" onClick={() => nav(`/audits/${v.id}`)} disabled={!audit}>
                <T>View AI Audit</T> <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* Evidence timeline + authenticity */}
        <details className="sp-disclosure va-more" open={analyzing || undefined}>
          <summary><T>Evidence details</T></summary>
          <div className="sp-disclosure-content">
            <section className="va-lower">
              <div className="card">
                <div className="row" style={{ marginBottom: 12 }}>
                  <div><h2><T>Visit timeline</T></h2><span className="mu sm">Pipeline log of this visit{analyzing ? ' · live' : ''}</span></div>
                  <ShieldCheck size={16} color="var(--blue)" />
                </div>
                <div className="va-chain">
                  {log.map((e, i) => (
                    <div className="va-chain-item" key={`${e.step}-${i}`}>
                      <div className="va-chain-dot">{BAD_STEPS.has(e.step) ? <X size={11} /> : <Check size={11} />}</div>
                      <div><b>{fmtTime(e.at)} · {STEP_LABEL[e.step] || e.step}</b><span style={{ display: 'block' }}>{e.summary}</span></div>
                      {i < log.length - 1 && <div className="va-chain-line" />}
                    </div>
                  ))}
                  {!log.length && (
                    <span className="mu sm">
                      {v.status === 'submitted' ? 'Not analyzed yet: run analysis to start the pipeline.'
                        : analyzing ? 'Waiting for the first pipeline step…' : 'No pipeline log: this is a seeded historical visit.'}
                    </span>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="row">
                  <h2><T>Visit Authenticity Score</T></h2>
                </div>
                <div className="va-auth-top">
                  <b>{auth.score ?? '—'}</b><span>/100 · {verdict || 'not scored yet'} · combined evidence signals</span>
                </div>
                <div className="va-signals">
                  {signals.map((s) => (
                    <div key={s.signal}>
                      <span>{signalLabel(s.signal)} — {s.detail}</span>
                      <b className={s.status === 'fail' ? 'red' : s.status === 'warn' ? 'amb' : undefined}>
                        {s.status}{s.penalty ? ` (−${s.penalty})` : ''}
                      </b>
                    </div>
                  ))}
                  {signals.length > 0 && (
                    <div><span>100 − {penalties} penalty points</span><b>= {Math.max(0, 100 - penalties)}{Math.max(0, 100 - penalties) !== auth.score ? ` (recorded ${auth.score})` : ''}</b></div>
                  )}
                  {!signals.length && <div><span>No per-signal breakdown recorded for this visit</span><b>—</b></div>}
                </div>
                {fraudError && <p className="va-auth-note red">Fraud breakdown unavailable: {errorText(fraudError)}</p>}
                <p className="va-auth-note">
                  Score = 100 minus the penalties of combined evidence signals. ≥ 70 VERIFIED · 30–69 review required (escalated
                  to a manager) · below 30 or a reused photo BLOCKED. No individual signal proves authenticity on its own.
                </p>
              </div>
            </section>

          </div>
        </details>

        {/* Automation pipeline + merchant guidance + actions */}
        <section className="card">
          <div className="row">
            <h2><T>Merchant guidance</T></h2>
            <span className="pill ev">Language: {iv ? langLabel(iv.message_language) : '—'}</span>
          </div>

          <div className="va-pipe">
            {steps.map((e, i, arr) => (
              <span key={e.step} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <span className="va-pipe-step">
                  <span className="dot">{BAD_STEPS.has(e.step) ? <X size={11} /> : <Check size={11} />}</span>
                  <b>{STEP_LABEL[e.step] || e.step}</b>
                </span>
                {i < arr.length - 1 && <ChevronRight size={16} color="rgba(245,247,244,0.3)" style={{ margin: '0 8px' }} />}
              </span>
            ))}
            {!steps.length && <span className="va-pipe-step">No pipeline steps recorded</span>}
          </div>

          {iv ? (
            <div className="va-message">
              <p>{iv.message_text}</p>
              <p className="mu sm" style={{ marginTop: 6 }}>
                English: {iv.message_text_en} · Issue: {iv.issue || actionLabel(iv.action)}{engine ? ` · Engine: ${engine}` : ''}
              </p>
            </div>
          ) : (
            <div className="va-message">
              <p className="mu">
                {v.decision === 'compliant' ? 'No merchant guidance needed: the counter is compliant.'
                  : v.decision === 'fraud' ? 'No guidance sent: the visit was blocked by the authenticity check.'
                  : v.decision === 'low_confidence' ? 'No guidance sent: the visit needs a manager review first.'
                  : 'No merchant guidance on this visit.'}
              </p>
            </div>
          )}

          {voice.url && (
            <audio controls autoPlay src={voice.url} style={{ width: '100%', marginBottom: 14 }}>
              <track kind="captions" />
            </audio>
          )}

          <div className="va-signals">
            <div>
              <span>Incentive</span>
              <b>{inc ? `${fmtInr(inc.amount_inr)} · ${inc.status} · ${inc.reason}` : 'None'}</b>
            </div>
            {notes.map((n) => (
              <div key={n.id}>
                <span>
                  WhatsApp to {n.to_phone} · {fmtTime(n.created_at)}
                  {n.error && <><br /><span className="red">{n.error}</span></>}
                  {n.audio_url && (
                    <audio controls src={mediaUrl(n.audio_url)} style={{ display: 'block', marginTop: 6, height: 32 }}>
                      <track kind="captions" />
                    </audio>
                  )}
                </span>
                <b className={n.status === 'failed' || n.status === 'undelivered' ? 'red' : undefined}>
                  {NOTIFICATION_LABEL[n.status] || n.status}
                </b>
              </div>
            ))}
            {!notes.length && <div><span>WhatsApp</span><b>Not sent</b></div>}
            <div>
              <span>
                Escalation{esc ? ` · ${esc.reason}` : ''}
                {esc?.resolved_by && <><br />Resolved by {esc.resolved_by}{esc.resolved_at ? ` · ${fmtDate(esc.resolved_at)} ${fmtTime(esc.resolved_at)}` : ''}{esc.note ? ` · “${esc.note}”` : ''}</>}
              </span>
              <b className={esc?.status === 'rejected' ? 'red' : esc?.status === 'open' ? 'amb' : undefined}>{esc ? esc.status : 'None'}</b>
            </div>
          </div>

          <div className="row">
            <button className="btn" onClick={playVoice} disabled={!iv || voice.loading}>
              <Play size={15} /> {voice.loading ? 'Generating voice…' : iv?.audio_url ? 'Play Voice Note' : 'Play Voice Preview'}
            </button>
            <button className="btn" disabled title="The pipeline sends WhatsApp automatically; there is no manual resend endpoint">
              <Send size={15} /> WhatsApp: {notes.length ? NOTIFICATION_LABEL[notes[notes.length - 1].status] || notes[notes.length - 1].status : 'not sent'}
            </button>
          </div>
        </section>
      </div>

      {toast && (
        <div className="va-toast">
          <AlertTriangle size={15} color="var(--blue)" /> {toast}
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 0, color: '#929A94', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
    </Layout>
  )
}
