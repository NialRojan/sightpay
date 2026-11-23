import { T } from '../components/Language'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  UserCheck,
  XCircle,
  Zap,
} from 'lucide-react'

import Layout from '../components/Layout'
import { visitPhotoUrl, listVisits } from '../services/visits'
import { listFlaggedVisits } from '../services/fraud'
import { analyzeImage } from '../services/audits'
import { fmtDate, fmtTime, SIGNAL_LABEL } from '../services/format'
import { useVisitEvidence, errorText } from '../components/visit/useVisitEvidence'
import {
  actionLabel, auditChecks, decisionLabel, guidanceEngine, paytmProminent, qrClear, signalsByName, statusLabel,
  statusPill, suspiciousOf,
} from '../components/visit/evidence'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Number(value) || 0))

const getScoreTone = (score) => {
  if (score >= 75) return 'good'
  if (score >= 50) return 'medium'
  return 'low'
}

// Evidence rows: pass -> verified, warn -> pending (clock), fail -> failed, missing -> pending.
const signalTone = (s) => (!s ? 'pending' : s.status === 'pass' ? 'verified' : s.status === 'fail' ? 'failed' : 'pending')
const signalValue = (s, fallback = 'Not recorded') =>
  !s ? fallback : `${s.status.toUpperCase()}${s.penalty ? ` (−${s.penalty})` : ''}`

/* -------------------------------------------------------------------------- */
/* Score Ring                                                                 */
/* -------------------------------------------------------------------------- */

function ScoreRing({ score = 0 }) {
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const progress =
    circumference -
    (clamp(score) / 100) * circumference

  return (
    <div className={`audit-score-ring ${getScoreTone(score)}`}>
      <svg viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="audit-ring-track"
        />

        <circle
          cx="60"
          cy="60"
          r={radius}
          className="audit-ring-progress"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
        />
      </svg>

      <div className="audit-score-value">
        <strong>{Math.round(clamp(score))}</strong>
        <span>/100</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Evidence Signal                                                            */
/* -------------------------------------------------------------------------- */

function EvidenceSignal({
  icon: Icon,
  label,
  value,
  detail,
  status = 'verified',
}) {
  const verified = status === 'verified'
  const pending = status === 'pending'

  return (
    <div className="audit-evidence-signal">
      <div
        className={`audit-signal-icon ${
          verified ? 'verified' : ''
        } ${pending ? 'pending' : ''}`}
      >
        <Icon size={16} />
      </div>

      <div className="audit-signal-copy">
        <span>{label}</span>
        <strong>{value}</strong>

        {detail && <small>{detail}</small>}
      </div>

      <div
        className={`audit-signal-status ${
          verified
            ? 'verified'
            : pending
              ? 'pending'
              : 'failed'
        }`}
      >
        {verified ? (
          <CheckCircle2 size={15} />
        ) : pending ? (
          <Clock3 size={15} />
        ) : (
          <XCircle size={15} />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* AI Finding                                                                  */
/* -------------------------------------------------------------------------- */

function AIFinding({
  title,
  value,
  score,
  description,
  status = 'pass',
}) {
  return (
    <div className={`ai-finding ${status}`}>
      <div className="ai-finding-top">
        <span>{title}</span>

        <strong>{value}</strong>
      </div>

      <div className="ai-finding-bar">
        <span
          style={{
            width: `${clamp(score)}%`,
          }}
        />
      </div>

      <div className="ai-finding-bottom">
        <small>{description}</small>

        {status === 'pass' ? (
          <CheckCircle2 size={15} />
        ) : (
          <XCircle size={15} />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Loading / states                                                           */
/* -------------------------------------------------------------------------- */

function AuditLoading() {
  return (
    <Layout crumb="AI Audit">
      <style>{AUDIT_CSS}</style>
      <div className="pad">
        <div className="card audit-state">
          <div className="audit-loader" />
          <h2>Loading AI audit</h2>
          <p className="mu">
            Retrieving visit evidence and Vision AI findings.
          </p>
        </div>
      </div>
    </Layout>
  )
}

function AuditState({ title, message, children }) {
  return (
    <Layout crumb="AI Audits">
      <style>{AUDIT_CSS}</style>
      <div className="pad">
        <div className="card audit-state">
          <XCircle size={28} />
          <h2>{title}</h2>
          <p className="mu">{message}</p>
          <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 12 }}>
            {children}
            <Link to="/fse/audits" className="btn p">Back to AI Audits</Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}

/* -------------------------------------------------------------------------- */
/* Vision findings (shared by a visit's audit and the photo-audit tool)       */
/* -------------------------------------------------------------------------- */

function AuditFindings({ audit, quality, provider, payload }) {
  const [copied, setCopied] = useState(false)
  const score = clamp(audit.qr_visibility_score)
  const confidence = clamp(Number(audit.confidence ?? 0) * 100)
  const actionRequired = audit.recommended_action && audit.recommended_action !== 'none'
  const quality_ = auditChecks(audit, quality).find((c) => c.key === 'quality')
  const suspicious = suspiciousOf(audit)

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      {/* Overall score */}
      <div className="audit-score-layout">
        <ScoreRing score={score} />
        <div className="audit-score-copy">
          <h3>{actionRequired ? 'Intervention required' : 'Counter condition acceptable'}</h3>
          <p className="mu sm">
            {actionLabel(audit.recommended_action)}
            {audit.notes ? ` — ${audit.notes}` : ''}
          </p>
          <div className="confidence-pill">
            <ShieldCheck size={14} />
            AI confidence {Math.round(confidence)}% · {provider || audit.provider || 'provider unknown'}
          </div>
        </div>
      </div>

      {/* Individual findings */}
      <div className="finding-list">
        <AIFinding
          title="Paytm QR visibility"
          value={`${Math.round(score)}/100`}
          score={score}
          description={score >= 70 ? 'QR is clearly visible' : 'QR visibility below the 70 threshold'}
          status={score >= 70 ? 'pass' : 'fail'}
        />
        <AIFinding
          title="QR clearly visible (not obstructed)"
          value={qrClear(audit) ? 'Yes' : audit.paytm_qr_visible ? 'Obstructed' : 'Not visible'}
          score={qrClear(audit) ? 100 : 0}
          description={qrClear(audit) ? 'Paytm QR visible and unobstructed' : audit.paytm_qr_visible ? 'Paytm QR is partly blocked' : 'No Paytm QR found in the photo'}
          status={qrClear(audit) ? 'pass' : 'fail'}
        />
        <AIFinding
          title="Soundbox"
          value={audit.soundbox_visible ? 'Visible' : 'Not visible'}
          score={audit.soundbox_visible ? 100 : 0}
          description={audit.soundbox_visible ? 'Paytm Soundbox visible on the counter' : 'Soundbox was not visible'}
          status={audit.soundbox_visible ? 'pass' : 'fail'}
        />
        <AIFinding
          title="Paytm counter prominence"
          value={paytmProminent(audit) ? 'Strong' : 'Low'}
          score={paytmProminent(audit) ? 100 : 0}
          description={audit.competitor ? `${audit.competitor} dominance: ${audit.competitor_dominance || '—'}` : 'No competitor detected'}
          status={paytmProminent(audit) ? 'pass' : 'fail'}
        />
        {quality_ && (
          <AIFinding
            title="Image quality"
            value={quality_.value}
            score={quality_.pass ? 100 : 0}
            description={
              suspicious.length ? `Suspicious signals: ${suspicious.join(', ')}`
                : quality?.brightness != null ? `Brightness ${Math.round(quality.brightness)}` : 'No suspicious image signals'
            }
            status={quality_.pass && !suspicious.length ? 'pass' : 'fail'}
          />
        )}
      </div>

      {/* Structured output: the backend payload as returned */}
      <div className="audit-json">
        <div className="audit-json-header">
          <span>VISION AI · STRUCTURED OUTPUT</span>
          <button onClick={copyPayload} title="Copy structured audit payload">
            {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
          </button>
        </div>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* /audits/:id — the Vision AI audit of one visit                             */
/* -------------------------------------------------------------------------- */

function VisitAIAudit({ id }) {
  const { visit: v, fraud, error, loading, busy } = useVisitEvidence(id)

  if (loading) return <AuditLoading />
  if (error || !v) {
    return <AuditState title="Audit unavailable" message={errorText(error) || 'The requested AI audit could not be loaded.'} />
  }
  if (!v.audit) {
    return (
      <AuditState
        title={v.status === 'analyzing' || busy ? 'Vision AI is still analyzing' : 'No audit for this visit yet'}
        message={`Visit #${v.id} at ${v.merchant_name} is ${statusLabel(v.status).toLowerCase()}. ${v.status === 'submitted' || v.status === 'failed' ? 'Run the analysis from the visit page.' : ''}`}
      >
        <Link to={`/visits/${v.id}`} className="btn"><T>Visit Evidence</T></Link>
      </AuditState>
    )
  }

  const audit = v.audit
  const signals = (fraud || v.authenticity || {}).signals || []
  const byName = signalsByName(signals)
  const photo = visitPhotoUrl(v)
  const actionRequired = audit.recommended_action && audit.recommended_action !== 'none'
  const log = v.pipeline_log || []
  const engine = guidanceEngine(log)
  const whatsapp = (v.actions?.notifications || [])[0]

  return (
    <Layout crumb="AI Audit">
      <style>{AUDIT_CSS}</style>

      <div className="pad ai-audit-page">
        <div className="audit-breadcrumb">
          <Link to="/fse/audits" className="audit-back">
            <ArrowLeft size={15} />
            <T>AI Audits</T>
          </Link>
          <span className="mu">/</span>
          <span className="mu">Visit #{v.id}</span>
        </div>

        <div className="audit-header">
          <div className="audit-title-wrap">
            <div className="eyebrow">COMPUTER VISION · VISIT AUDIT</div>
            <h1>{v.merchant_name}</h1>
            <div className="audit-title-meta">
              <span className="mu">Visit #{v.id}</span>
              <span className="mu">·</span>
              <span className="mu">{fmtDate(v.received_at)} {fmtTime(v.received_at)}</span>
              <span className="audit-status">
                <Target size={13} />
                {actionRequired ? `Action Required: ${actionLabel(audit.recommended_action)}` : 'Audit Passed'}
              </span>
              <span className={`pill ${statusPill(v.status)}`}>{statusLabel(v.status)}</span>
            </div>
          </div>

          <div className="audit-actions">
            <Link to={`/visits/${v.id}`} className="btn"><T>Visit Evidence</T></Link>
            <Link to={`/merchants/${v.merchant_id}`} className="btn p">
              Merchant 360
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <div className="audit-grid">
          <div>
            <section className="card audit-main-card">
              <div className="audit-photo">
                {photo ? (
                  <img src={photo} alt={`Captured merchant counter at ${v.merchant_name}`} />
                ) : (
                  <div className="audit-photo-placeholder">
                    <Camera size={38} />
                    <strong>No photo: historical visit</strong>
                    <span>Seeded visits carry an audit but no image.</span>
                  </div>
                )}

                <div className="audit-photo-overlay">
                  <div className="audit-photo-label">
                    <i />
                    CAPTURED VISIT EVIDENCE
                  </div>
                  <div className="audit-photo-footer">
                    <span>
                      <Camera size={13} />
                      {v.capture_source === 'gallery' ? 'Picked from gallery' : v.capture_source === 'camera' ? 'In-app camera' : 'Capture source unknown'}
                    </span>
                    <span>
                      <Eye size={13} />
                      Vision: {audit.provider || '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="audit-findings">
                <div className="audit-card-heading">
                  <div>
                    <div className="eyebrow">VISION AI</div>
                    <h2><T>Counter Audit</T></h2>
                    <span className="mu sm">Structured analysis of the captured merchant counter.</span>
                  </div>
                  <Sparkles size={19} color="#1F5BFF" />
                </div>
                <AuditFindings audit={audit} provider={audit.provider} payload={audit} />
              </div>
            </section>

            <div className="audit-context-grid">
              <div className="audit-context-item">
                <span>MERCHANT</span>
                <strong>{v.merchant_name}</strong>
              </div>
              <div className="audit-context-item">
                <span>FIELD EXECUTIVE</span>
                <strong>{v.fse_name}</strong>
              </div>
              <div className="audit-context-item">
                <span>LOCATION</span>
                <strong>{v.lat != null ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : '—'}</strong>
              </div>
              <div className="audit-context-item">
                <span>AUDIT ID</span>
                <strong>Visit #{v.id}</strong>
              </div>
            </div>
          </div>

          <aside className="audit-side">
            <section className="card audit-side-card">
              <div className="audit-card-heading">
                <div>
                  <div className="eyebrow">EVIDENCE GATE</div>
                  <h2><T>Visit Verification</T></h2>
                </div>
                <ShieldCheck size={18} color="#1F5BFF" />
              </div>

              <div className="audit-evidence-list">
                <EvidenceSignal icon={MapPin} label={SIGNAL_LABEL.gps} value={signalValue(byName.gps)} detail={byName.gps?.detail} status={signalTone(byName.gps)} />
                <EvidenceSignal
                  icon={Clock3}
                  label={SIGNAL_LABEL.timestamp}
                  value={signalValue(byName.timestamp)}
                  detail={byName.timestamp?.detail || (v.captured_at ? `Captured ${fmtDate(v.captured_at)} ${fmtTime(v.captured_at)}` : undefined)}
                  status={signalTone(byName.timestamp)}
                />
                <EvidenceSignal icon={Camera} label={SIGNAL_LABEL.live_capture} value={signalValue(byName.live_capture)} detail={byName.live_capture?.detail} status={signalTone(byName.live_capture)} />
                <EvidenceSignal icon={Fingerprint} label={SIGNAL_LABEL.duplicate_image} value={signalValue(byName.duplicate_image)} detail={byName.duplicate_image?.detail} status={signalTone(byName.duplicate_image)} />
                <EvidenceSignal icon={UserCheck} label={SIGNAL_LABEL.exif} value={signalValue(byName.exif)} detail={byName.exif?.detail} status={signalTone(byName.exif)} />
              </div>
              {!signals.length && <p className="mu sm">No per-signal breakdown recorded for this visit (seeded historical visit).</p>}
            </section>

            <section className="card recommendation-card">
              <div className="recommendation-icon">
                <Zap size={18} />
              </div>
              <div className="eyebrow">AI RECOMMENDATION</div>
              <h3>{actionLabel(audit.recommended_action)}</h3>
              <p className="mu sm">
                {(v.decision_reasons || []).join(' · ') || 'Recommendation generated from the counter-level Vision AI findings.'}
              </p>
              <div className="recommendation-meta">
                <Target size={13} />
                Evidence → Finding → Recommended action
              </div>
            </section>

            <section className="card audit-side-card">
              <div className="audit-card-heading">
                <div>
                  <div className="eyebrow">DECISION ENGINE</div>
                  <h2><T>Action Pipeline</T></h2>
                </div>
                <Zap size={18} color="#1F5BFF" />
              </div>

              <div className="audit-evidence-list">
                <EvidenceSignal
                  icon={Target}
                  label="AI decision"
                  value={decisionLabel(v.decision)}
                  detail={`QR visibility ${Math.round(clamp(audit.qr_visibility_score))}/100 · confidence ${Math.round(clamp(audit.confidence * 100))}%`}
                  status={v.decision ? (v.decision === 'fraud' ? 'failed' : 'verified') : 'pending'}
                />
                <EvidenceSignal
                  icon={Sparkles}
                  label="Merchant guidance"
                  value={engine ? `Engine: ${engine}` : 'Not executed'}
                  detail={log.find((e) => e.step === 'guidance')?.summary || 'No guidance step on this visit'}
                  status={engine ? 'verified' : 'pending'}
                />
                <EvidenceSignal
                  icon={Zap}
                  label="Pipeline"
                  value={v.pipeline_mode || '—'}
                  detail={whatsapp ? `WhatsApp ${whatsapp.status} to ${whatsapp.to_phone}` : `${log.length} pipeline step(s) logged`}
                  status={v.pipeline_mode ? 'verified' : 'pending'}
                />
              </div>

              <Link
                to={`/visits/${v.id}`}
                className="btn p"
                style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
              >
                Continue to Visit Evidence
                <ArrowRight size={14} />
              </Link>
            </section>

            <section className="card audit-side-card">
              <div className="eyebrow">EVIDENCE INTEGRITY</div>
              <h3 style={{ margin: '5px 0 8px' }}>Evidence fingerprint</h3>
              <p className="mu sm" style={{ lineHeight: 1.5, marginBottom: 12 }}>
                The photo is compared with earlier visit photos to detect reused evidence.
              </p>
              <div
                style={{
                  padding: 11,
                  borderRadius: 10,
                  background: '#f4f7ff',
                  border: '1px solid #dde7fb',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 10,
                  wordBreak: 'break-all',
                  color: '#52688f',
                }}
              >
                {byName.duplicate_image?.detail || 'Fingerprint check not recorded for this visit'}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  )
}

/* -------------------------------------------------------------------------- */
/* /fse/audits — audit a photo (stateless) + flagged and recent visit audits  */
/* -------------------------------------------------------------------------- */

function useList(load) {
  const [state, setState] = useState({ rows: null, error: null })
  useEffect(() => {
    let alive = true
    load().then(
      (rows) => alive && setState({ rows, error: null }),
      (error) => alive && setState({ rows: [], error }),
    )
    return () => { alive = false }
  }, [load])
  return state
}

const loadFlagged = () => listFlaggedVisits()
const loadRecent = () => listVisits({ limit: 12 })

function VisitRows({ state, to, empty, verdict }) {
  if (!state.rows) return <p className="mu sm">Loading…</p>
  if (state.error) return <p className="mu sm">Could not load: {errorText(state.error)}</p>
  if (!state.rows.length) return <p className="mu sm">{empty}</p>
  return (
    <div className="audit-evidence-list">
      {state.rows.map((r) => (
        <Link key={r.id} to={to(r)} style={{ color: 'inherit', textDecoration: 'none' }}>
          <EvidenceSignal
            icon={Store}
            label={`Visit #${r.id} · ${fmtDate(r.received_at)} · ${r.fse_name}`}
            value={r.merchant_name}
            detail={
              verdict
                ? `${r.verdict} · authenticity ${r.authenticity_score ?? '—'}/100 · ${statusLabel(r.status)}`
                : `QR ${r.qr_visibility_score ?? '—'}/100 · ${decisionLabel(r.decision)}`
            }
            status={verdict ? (r.verdict === 'BLOCKED' ? 'failed' : 'pending') : r.decision === 'compliant' ? 'verified' : r.decision ? 'failed' : 'pending'}
          />
        </Link>
      ))}
    </div>
  )
}

function AuditsHome() {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const flagged = useList(loadFlagged)
  const recent = useList(loadRecent)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const pick = (e) => {
    setFile(e.target.files?.[0] || null)
    setResult(null)
    setError(null)
  }

  const run = async () => {
    if (!file) return
    setRunning(true)
    setError(null)
    try {
      setResult(await analyzeImage(file))
    } catch (e) {
      setResult(null)
      setError(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Layout crumb="AI Audits">
      <style>{AUDIT_CSS}</style>

      <div className="pad ai-audit-page">
        <div className="audit-header">
          <div className="audit-title-wrap">
            <div className="eyebrow">COMPUTER VISION · AI AUDITS</div>
            <h1><T>AI Audits</T></h1>
            <div className="audit-title-meta">
              <span className="mu">Audit a counter photo without creating a visit, or open a visit&apos;s audit.</span>
            </div>
          </div>
        </div>

        <div className="audit-grid">
          <div>
            <section className="card audit-main-card">
              <div className="audit-photo">
                {preview ? (
                  <img src={preview} alt="Counter photo to audit" />
                ) : (
                  <div className="audit-photo-placeholder">
                    <Camera size={38} />
                    <strong>Choose a counter photo</strong>
                    <span>JPEG, PNG or WebP up to 10 MB. Nothing is stored.</span>
                  </div>
                )}
                <div className="audit-photo-overlay">
                  <div className="audit-photo-label">
                    <i />
                    PHOTO AUDIT · NOT SAVED
                  </div>
                </div>
              </div>

              <div className="audit-findings">
                <div className="audit-card-heading">
                  <div>
                    <div className="eyebrow">VISION AI</div>
                    <h2><T>Audit a photo</T></h2>
                    <span className="mu sm">Runs the same Vision AI audit as a visit (POST /audit/analyze-image).</span>
                  </div>
                  <Sparkles size={19} color="#1F5BFF" />
                </div>

                <div className="audit-actions" style={{ marginBottom: 16, alignItems: 'center' }}>
                  <label className="btn" style={{ cursor: 'pointer' }}>
                    <Camera size={14} /> {file ? file.name : 'Choose photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} style={{ display: 'none' }} data-testid="audit-photo-input" />
                  </label>
                  <button className="btn p" onClick={run} disabled={!file || running}>
                    {running ? 'Auditing…' : 'Run audit'}
                    <ArrowRight size={14} />
                  </button>
                </div>

                {error && <p className="mu sm" style={{ color: '#DC2626', marginBottom: 12 }}>Audit failed: {errorText(error)}</p>}
                {result && (
                  <AuditFindings audit={result.audit} quality={result.quality} provider={result.provider} payload={result} />
                )}
                {!result && !error && <p className="mu sm">Pick a photo and run the audit to see the structured findings.</p>}
              </div>
            </section>
          </div>

          <aside className="audit-side">
            <section className="card audit-side-card">
              <div className="audit-card-heading">
                <div>
                  <div className="eyebrow">EVIDENCE GATE</div>
                  <h2><T>Flagged visits</T></h2>
                  <span className="mu sm">Authenticity review required or blocked</span>
                </div>
                <ShieldCheck size={18} color="#1F5BFF" />
              </div>
              <VisitRows state={flagged} to={(r) => `/visits/${r.id}`} verdict empty="No flagged visits: every recent visit passed the combined evidence signals." />
            </section>

            <section className="card audit-side-card">
              <div className="audit-card-heading">
                <div>
                  <div className="eyebrow">VISION AI</div>
                  <h2><T>Recent visit audits</T></h2>
                </div>
                <Eye size={18} color="#1F5BFF" />
              </div>
              <VisitRows state={recent} to={(r) => `/audits/${r.id}`} empty="No visits yet." />
            </section>
          </aside>
        </div>
      </div>
    </Layout>
  )
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

export default function AIAudit() {
  const { id } = useParams()
  return id ? <VisitAIAudit id={id} /> : <AuditsHome />
}

/* -------------------------------------------------------------------------- */
/* Styles (unchanged from the original page)                                  */
/* -------------------------------------------------------------------------- */

const AUDIT_CSS = `

        .ai-audit-page {
          padding-bottom: 50px;
        }

        .audit-breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
        }

        .audit-back {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: inherit;
          text-decoration: none;
          font-size: 13px;
          font-weight: 650;
        }

        .audit-back:hover {
          opacity: .72;
        }

        .audit-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          margin-bottom: 22px;
        }

        .audit-title-wrap h1 {
          margin: 4px 0 7px;
        }

        .audit-title-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .audit-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 11px;
          border-radius: 999px;
          background: #eef3ff;
          color: #1f5bff;
          font-size: 12px;
          font-weight: 750;
        }

        .audit-actions {
          display: flex;
          gap: 9px;
        }

        .audit-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.55fr)
            minmax(320px, .75fr);
          gap: 18px;
        }

        .audit-main-card {
          overflow: hidden;
        }

        /* ---------------------------------------------------------------- */
        /* ACTUAL CAPTURED IMAGE                                             */
        /* ---------------------------------------------------------------- */

        .audit-photo {
          min-height: 420px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0b0f14;
          overflow: hidden;
        }

        .audit-photo img {
          width: 100%;
          height: 420px;
          object-fit: cover;
          display: block;
        }

        .audit-photo-placeholder {
          width: 100%;
          min-height: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #8d98a8;
          background: #10151b;
          text-align: center;
          padding: 30px;
        }

        .audit-photo-placeholder svg {
          opacity: .55;
        }

        .audit-photo-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .audit-photo-label {
          position: absolute;
          top: 18px;
          left: 18px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 11px;
          border-radius: 999px;
          background: rgba(8, 12, 17, .82);
          color: white;
          font-size: 11px;
          font-weight: 700;
        }

        .audit-photo-label i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #1f5bff;
        }

        .audit-photo-footer {
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .audit-photo-footer span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(8, 12, 17, .82);
          color: white;
          font-size: 11px;
          font-weight: 650;
        }

        /* ---------------------------------------------------------------- */
        /* FINDINGS                                                          */
        /* ---------------------------------------------------------------- */

        .audit-findings {
          padding: 20px;
        }

        .audit-card-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 17px;
        }

        .audit-card-heading h2 {
          margin: 3px 0 4px;
        }

        .audit-score-layout {
          display: flex;
          align-items: center;
          gap: 22px;
          padding: 16px;
          border-radius: 18px;
          background: #f4f7ff;
          border: 1px solid #dde7fb;
          margin-bottom: 16px;
        }

        .audit-score-ring {
          width: 110px;
          height: 110px;
          position: relative;
          flex: 0 0 110px;
        }

        .audit-score-ring svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .audit-ring-track {
          fill: none;
          stroke: #dbe6fb;
          stroke-width: 8;
        }

        .audit-ring-progress {
          fill: none;
          stroke: #1f5bff;
          stroke-width: 8;
          stroke-linecap: round;
        }

        .audit-score-ring.low .audit-ring-progress {
          stroke: #5b6e96;
        }

        .audit-score-ring.medium .audit-ring-progress {
          stroke: #1f5bff;
        }

        .audit-score-ring.good .audit-ring-progress {
          stroke: #1f5bff;
        }

        .audit-score-value {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }

        .audit-score-value strong {
          font-size: 29px;
          line-height: 1;
        }

        .audit-score-value span {
          font-size: 10px;
          color: #5b6e96;
          margin-top: 4px;
        }

        .audit-score-copy h3 {
          margin: 0 0 5px;
        }

        .audit-score-copy p {
          margin: 0;
          line-height: 1.5;
        }

        .confidence-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 9px;
          color: #1f5bff;
          font-size: 12px;
          font-weight: 750;
        }

        .finding-list {
          display: grid;
          gap: 10px;
        }

        .ai-finding {
          padding: 13px 14px;
          border: 1px solid #dde7fb;
          border-radius: 14px;
          background: white;
        }

        .ai-finding-top,
        .ai-finding-bottom {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .ai-finding-top span {
          font-size: 12px;
          color: #5b6e96;
        }

        .ai-finding-top strong {
          font-size: 13px;
        }

        .ai-finding-bar {
          height: 5px;
          background: #edf2fc;
          border-radius: 999px;
          overflow: hidden;
          margin: 9px 0 7px;
        }

        .ai-finding-bar span {
          display: block;
          height: 100%;
          background: #1f5bff;
          border-radius: inherit;
        }

        .ai-finding.fail .ai-finding-bar span {
          background: #5b6e96;
        }

        .ai-finding-bottom small {
          color: #71809d;
          font-size: 11px;
        }

        .ai-finding-bottom svg {
          color: #1f5bff;
        }

        .ai-finding.fail .ai-finding-bottom svg {
          color: #5b6e96;
        }

        /* ---------------------------------------------------------------- */
        /* JSON                                                              */
        /* ---------------------------------------------------------------- */

        .audit-json {
          margin-top: 18px;
          padding: 17px;
          border-radius: 16px;
          background: #0a1b3d;
          color: #dce8ff;
          overflow: auto;
        }

        .audit-json-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .audit-json-header span {
          font-size: 11px;
          color: #9cc0ff;
          font-weight: 750;
          letter-spacing: .04em;
        }

        .audit-json button {
          border: 0;
          background: transparent;
          color: #dce8ff;
          cursor: pointer;
        }

        .audit-json pre {
          margin: 0;
          font-size: 11px;
          line-height: 1.65;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        }

        /* ---------------------------------------------------------------- */
        /* RIGHT SIDE                                                        */
        /* ---------------------------------------------------------------- */

        .audit-side {
          display: grid;
          gap: 18px;
          align-content: start;
        }

        .audit-side-card {
          padding: 20px;
        }

        .audit-evidence-list {
          display: grid;
          gap: 2px;
        }

        .audit-evidence-signal {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 12px 0;
          border-bottom: 1px solid #edf1f8;
        }

        .audit-evidence-signal:last-child {
          border-bottom: 0;
        }

        .audit-signal-icon {
          width: 35px;
          height: 35px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          background: #eef3ff;
          color: #71809d;
          flex: 0 0 35px;
        }

        .audit-signal-icon.verified {
          color: #1f5bff;
        }

        .audit-signal-copy {
          min-width: 0;
          flex: 1;
        }

        .audit-signal-copy span,
        .audit-signal-copy strong,
        .audit-signal-copy small {
          display: block;
        }

        .audit-signal-copy span {
          font-size: 11px;
          color: #71809d;
        }

        .audit-signal-copy strong {
          font-size: 13px;
          margin-top: 2px;
        }

        .audit-signal-copy small {
          color: #7f8ba3;
          margin-top: 3px;
          font-size: 10px;
        }

        .audit-signal-status {
          color: #9aa8c2;
        }

        .audit-signal-status.verified {
          color: #1f5bff;
        }

        .audit-signal-status.failed {
          color: #5b6e96;
        }

        .audit-signal-status.pending {
          color: #9aa8c2;
        }

        /* ---------------------------------------------------------------- */
        /* RECOMMENDATION                                                    */
        /* ---------------------------------------------------------------- */

        .recommendation-card {
          padding: 20px;
          background:
            radial-gradient(
              circle at 100% 0%,
              rgba(156,192,255,.45),
              transparent 45%
            ),
            #eef3ff;
          border: 1px solid #cddcf9;
        }

        .recommendation-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: white;
          color: #1f5bff;
          margin-bottom: 13px;
        }

        .recommendation-card h3 {
          margin: 4px 0 7px;
        }

        .recommendation-card p {
          line-height: 1.55;
          margin: 0 0 15px;
        }

        .recommendation-meta {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          color: #52688f;
        }

        /* ---------------------------------------------------------------- */
        /* CONTEXT                                                           */
        /* ---------------------------------------------------------------- */

        .audit-context-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-top: 18px;
        }

        .audit-context-item {
          padding: 14px;
          border: 1px solid #dde7fb;
          border-radius: 14px;
          background: white;
        }

        .audit-context-item span {
          display: block;
          color: #71809d;
          font-size: 10px;
          margin-bottom: 6px;
        }

        .audit-context-item strong {
          display: block;
          font-size: 12px;
        }

        /* ---------------------------------------------------------------- */
        /* STATES                                                            */
        /* ---------------------------------------------------------------- */

        .audit-state {
          padding: 50px;
          text-align: center;
        }

        .audit-state svg {
          color: #1f5bff;
        }

        .audit-state h2 {
          margin: 12px 0 5px;
        }

        .audit-loader {
          width: 30px;
          height: 30px;
          margin: 0 auto 15px;
          border: 3px solid #dbe6fb;
          border-top-color: #1f5bff;
          border-radius: 50%;
          animation: audit-spin .8s linear infinite;
        }

        @keyframes audit-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1050px) {
          .audit-grid {
            grid-template-columns: 1fr;
          }

          .audit-side {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 760px) {
          .audit-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .audit-side {
            grid-template-columns: 1fr;
          }

          .audit-context-grid {
            grid-template-columns: 1fr 1fr;
          }

          .audit-score-layout {
            align-items: flex-start;
          }

          .audit-photo,
          .audit-photo img,
          .audit-photo-placeholder {
            min-height: 320px;
            height: 320px;
          }
        }
      `
