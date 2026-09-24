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

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || ''

async function fetchAudit(id) {
  const response = await fetch(
    `${API_BASE}/visits/${encodeURIComponent(id)}/audit`,
  )

  if (!response.ok) {
    throw new Error(
      `Unable to load audit (${response.status})`,
    )
  }

  return response.json()
}

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
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

function AuditLoading() {
  return (
    <Layout crumb="AI Audit">
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

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

export default function AIAudit() {
  const { id } = useParams()

  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  /* ---------------------------------------------------------------------- */
  /* Fetch real audit                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const data = await fetchAudit(id)

        if (!cancelled) {
          setAudit(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message ||
              'Unable to load this AI audit.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (id) {
      load()
    } else {
      setLoading(false)
      setError('No audit ID was provided.')
    }

    return () => {
      cancelled = true
    }
  }, [id])

  /* ---------------------------------------------------------------------- */
  /* Normalized values                                                      */
  /* ---------------------------------------------------------------------- */

  const view = useMemo(() => {
    if (!audit) return null

    /*
     * Backend contract:
     *
     * {
     *   visit_id,
     *   merchant,
     *   location,
     *   fse,
     *   captured_image_url,
     *
     *   audit: {
     *     visibility_score,
     *     qr_visibility_score,
     *     qr_near_billing,
     *     soundbox_present,
     *     soundbox_visible,
     *     paytm_dominance,
     *     competitor_detected,
     *     competitor_name,
     *     competitor_dominance,
     *     confidence,
     *     recommended_action
     *   },
     *
     *   evidence: {
     *     gps,
     *     timestamp,
     *     geofence,
     *     image,
     *     image_hash,
     *     merchant_match
     *   },
     *
     *   execution: {
     *     ai_decision,
     *     sarvam_status,
     *     n8n_status
     *   }
     * }
     */

    const ai = audit.audit || {}
    const evidence = audit.evidence || {}
    const execution = audit.execution || {}

    return {
      visitId:
        audit.visit_id ||
        audit.visitId ||
        id,

      merchantName:
        audit.merchant?.name ||
        audit.merchant_name ||
        'Merchant',

      merchantId:
        audit.merchant?.id ||
        audit.merchant_id,

      location:
        audit.merchant?.location ||
        audit.location ||
        'Location unavailable',

      fse:
        audit.fse?.name ||
        audit.fse_name ||
        'Field Executive',

      image:
        audit.captured_image_url ||
        audit.image_url ||
        audit.imageUrl ||
        '',

      timestamp:
        audit.timestamp ||
        evidence.timestamp ||
        'Timestamp unavailable',

      score: clamp(
        ai.visibility_score ??
          audit.visibility_score ??
          0,
      ),

      confidence: clamp(
        Number(ai.confidence ?? 0) * 100 > 1
          ? ai.confidence
          : Number(ai.confidence ?? 0) * 100,
      ),

      qrVisibility: clamp(
        ai.qr_visibility_score ??
          audit.qr_visibility_score ??
          0,
      ),

      qrNearBilling:
        Boolean(ai.qr_near_billing),

      soundboxPresent:
        Boolean(ai.soundbox_present),

      soundboxVisible:
        Boolean(ai.soundbox_visible),

      paytmDominance:
        Boolean(ai.paytm_dominance),

      competitorDetected:
        Boolean(ai.competitor_detected),

      competitor:
        ai.competitor_name ||
        'No competitor detected',

      competitorLevel:
        ai.competitor_dominance ||
        'none',

      recommendation:
        ai.recommended_action ||
        'No intervention recommended.',

      gps:
        evidence.gps,

      geofence:
        evidence.geofence,

      imageEvidence:
        evidence.image,

      imageHash:
        evidence.image_hash,

      merchantMatch:
        evidence.merchant_match,

      aiDecision:
        execution.ai_decision,

      sarvamStatus:
        execution.sarvam_status,

      n8nStatus:
        execution.n8n_status,

      rawPayload: audit,
    }
  }, [audit, id])

  /* ---------------------------------------------------------------------- */
  /* Copy structured payload                                                */
  /* ---------------------------------------------------------------------- */

  const copyPayload = async () => {
    if (!view) return

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(view.rawPayload, null, 2),
      )

      setCopied(true)

      setTimeout(() => {
        setCopied(false)
      }, 1600)
    } catch {
      setCopied(false)
    }
  }

  /* ---------------------------------------------------------------------- */
  /* States                                                                 */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return <AuditLoading />
  }

  if (error || !view) {
    return (
      <Layout crumb="AI Audits">
        <div className="pad">
          <div className="card audit-state">
            <XCircle size={28} />

            <h2>Audit unavailable</h2>

            <p className="mu">
              {error ||
                'The requested AI audit could not be loaded.'}
            </p>

            <Link
              to="/fse/audits"
              className="btn p"
            >
              Back to AI Audits
            </Link>
          </div>
        </div>
      </Layout>
    )
  }

  const actionRequired =
    view.score < 75 ||
    !view.qrNearBilling ||
    !view.paytmDominance

  return (
    <Layout crumb="AI Audit">
      <style>{`
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
      `}</style>

      <div className="pad ai-audit-page">

        {/* ================================================================ */}
        {/* BREADCRUMB                                                        */}
        {/* ================================================================ */}

        <div className="audit-breadcrumb">
          <Link
            to="/fse/audits"
            className="audit-back"
          >
            <ArrowLeft size={15} />
            AI Audits
          </Link>

          <span className="mu">/</span>

          <span className="mu">
            {view.visitId}
          </span>
        </div>

        {/* ================================================================ */}
        {/* HEADER                                                            */}
        {/* ================================================================ */}

        <div className="audit-header">
          <div className="audit-title-wrap">

            <div className="eyebrow">
              COMPUTER VISION · VISIT AUDIT
            </div>

            <h1>
              {view.merchantName}
            </h1>

            <div className="audit-title-meta">

              <span className="mu">
                {view.visitId}
              </span>

              <span className="mu">
                ·
              </span>

              <span className="mu">
                {view.timestamp}
              </span>

              <span className="audit-status">
                <Target size={13} />

                {actionRequired
                  ? 'Action Required'
                  : 'Audit Passed'}
              </span>

            </div>

          </div>

          <div className="audit-actions">

            <Link
              to={`/visits/${view.visitId}`}
              className="btn"
            >
              Visit Evidence
            </Link>

            {view.merchantId && (
              <Link
                to={`/merchants/${view.merchantId}`}
                className="btn p"
              >
                Merchant 360
                <ArrowRight size={14} />
              </Link>
            )}

          </div>
        </div>

        {/* ================================================================ */}
        {/* MAIN GRID                                                         */}
        {/* ================================================================ */}

        <div className="audit-grid">

          {/* ============================================================ */}
          {/* LEFT                                                           */}
          {/* ============================================================ */}

          <div>

            {/* ---------------------------------------------------------- */}
            {/* ACTUAL CAPTURED IMAGE                                       */}
            {/* ---------------------------------------------------------- */}

            <section className="card audit-main-card">

              <div className="audit-photo">

                {view.image ? (
                  <img
                    src={view.image}
                    alt={`Captured merchant counter at ${view.merchantName}`}
                  />
                ) : (
                  <div className="audit-photo-placeholder">
                    <Camera size={38} />

                    <strong>
                      Captured image unavailable
                    </strong>

                    <span>
                      The audit record does not contain an image URL.
                    </span>
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
                      Original visit image
                    </span>

                    <span>
                      <Eye size={13} />
                      Vision analysis
                    </span>

                  </div>

                </div>

              </div>

              {/* -------------------------------------------------------- */}
              {/* AI FINDINGS                                                */}
              {/* -------------------------------------------------------- */}

              <div className="audit-findings">

                <div className="audit-card-heading">

                  <div>
                    <div className="eyebrow">
                      VISION AI
                    </div>

                    <h2>
                      Counter Audit
                    </h2>

                    <span className="mu sm">
                      Structured analysis of the captured merchant
                      counter.
                    </span>
                  </div>

                  <Sparkles
                    size={19}
                    color="#1F5BFF"
                  />

                </div>

                {/* Overall score */}

                <div className="audit-score-layout">

                  <ScoreRing score={view.score} />

                  <div className="audit-score-copy">

                    <h3>
                      {actionRequired
                        ? 'Intervention required'
                        : 'Counter condition acceptable'}
                    </h3>

                    <p className="mu sm">
                      {view.recommendation}
                    </p>

                    <div className="confidence-pill">
                      <ShieldCheck size={14} />

                      AI confidence{' '}
                      {Math.round(view.confidence)}%
                    </div>

                  </div>

                </div>

                {/* Individual findings */}

                <div className="finding-list">

                  <AIFinding
                    title="Paytm QR visibility"
                    value={`${Math.round(
                      view.qrVisibility,
                    )}/100`}
                    score={view.qrVisibility}
                    description={
                      view.qrVisibility >= 75
                        ? 'QR is clearly visible'
                        : 'QR visibility needs improvement'
                    }
                    status={
                      view.qrVisibility >= 75
                        ? 'pass'
                        : 'fail'
                    }
                  />

                  <AIFinding
                    title="QR near billing point"
                    value={
                      view.qrNearBilling
                        ? 'Detected'
                        : 'Not detected'
                    }
                    score={
                      view.qrNearBilling
                        ? 100
                        : 0
                    }
                    description={
                      view.qrNearBilling
                        ? 'QR placement is close to the billing area'
                        : 'QR should be moved closer to billing'
                    }
                    status={
                      view.qrNearBilling
                        ? 'pass'
                        : 'fail'
                    }
                  />

                  <AIFinding
                    title="Soundbox"
                    value={
                      view.soundboxPresent
                        ? view.soundboxVisible
                          ? 'Visible'
                          : 'Detected'
                        : 'Not detected'
                    }
                    score={
                      view.soundboxPresent
                        ? 100
                        : 0
                    }
                    description={
                      view.soundboxPresent
                        ? 'Paytm Soundbox detected'
                        : 'Soundbox was not detected'
                    }
                    status={
                      view.soundboxPresent
                        ? 'pass'
                        : 'fail'
                    }
                  />

                  <AIFinding
                    title="Paytm counter prominence"
                    value={
                      view.paytmDominance
                        ? 'Strong'
                        : 'Low'
                    }
                    score={
                      view.paytmDominance
                        ? 100
                        : 0
                    }
                    description={
                      view.competitorDetected
                        ? `${view.competitor} has stronger counter visibility`
                        : 'No stronger competitor detected'
                    }
                    status={
                      view.paytmDominance
                        ? 'pass'
                        : 'fail'
                    }
                  />

                </div>

                {/* ------------------------------------------------------ */}
                {/* STRUCTURED OUTPUT                                       */}
                {/* ------------------------------------------------------ */}

                <div className="audit-json">

                  <div className="audit-json-header">

                    <span>
                      VISION AI · STRUCTURED OUTPUT
                    </span>

                    <button
                      onClick={copyPayload}
                      title="Copy structured audit payload"
                    >
                      {copied ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Copy size={15} />
                      )}
                    </button>

                  </div>

                  <pre>
{JSON.stringify(
  {
    visit_id: view.visitId,
    paytm_qr_present: view.qrVisibility > 0,
    qr_visibility_score: Math.round(
      view.qrVisibility,
    ),
    qr_near_billing: view.qrNearBilling,
    soundbox_present: view.soundboxPresent,
    soundbox_visible: view.soundboxVisible,
    paytm_dominance: view.paytmDominance,
    competitor_detected:
      view.competitorDetected,
    competitor_name:
      view.competitorDetected
        ? view.competitor
        : null,
    competitor_dominance:
      view.competitorLevel,
    recommended_action:
      view.recommendation,
    confidence:
      Number(view.confidence / 100).toFixed(2),
  },
  null,
  2,
)}
                  </pre>

                </div>

              </div>

            </section>

            {/* ---------------------------------------------------------- */}
            {/* VISIT CONTEXT                                                */}
            {/* ---------------------------------------------------------- */}

            <div className="audit-context-grid">

              <div className="audit-context-item">

                <span>
                  MERCHANT
                </span>

                <strong>
                  {view.merchantName}
                </strong>

              </div>

              <div className="audit-context-item">

                <span>
                  FIELD EXECUTIVE
                </span>

                <strong>
                  {view.fse}
                </strong>

              </div>

              <div className="audit-context-item">

                <span>
                  LOCATION
                </span>

                <strong>
                  {view.location}
                </strong>

              </div>

              <div className="audit-context-item">

                <span>
                  AUDIT ID
                </span>

                <strong>
                  {view.visitId}
                </strong>

              </div>

            </div>

          </div>

          {/* ============================================================ */}
          {/* RIGHT                                                          */}
          {/* ============================================================ */}

          <aside className="audit-side">

            {/* ---------------------------------------------------------- */}
            {/* EVIDENCE GATE                                                */}
            {/* ---------------------------------------------------------- */}

            <section className="card audit-side-card">

              <div className="audit-card-heading">

                <div>
                  <div className="eyebrow">
                    EVIDENCE GATE
                  </div>

                  <h2>
                    Visit Verification
                  </h2>
                </div>

                <ShieldCheck
                  size={18}
                  color="#1F5BFF"
                />

              </div>

              <div className="audit-evidence-list">

                <EvidenceSignal
                  icon={MapPin}
                  label="GPS location"
                  value={
                    view.gps?.verified
                      ? 'Verified'
                      : 'Unavailable'
                  }
                  detail={
                    view.geofence?.distance
                      ? `${view.geofence.distance} from merchant`
                      : view.geofence?.detail
                  }
                  status={
                    view.gps?.verified
                      ? 'verified'
                      : 'pending'
                  }
                />

                <EvidenceSignal
                  icon={Clock3}
                  label="Timestamp"
                  value={
                    view.timestamp
                      ? 'Captured'
                      : 'Unavailable'
                  }
                  detail={view.timestamp}
                  status={
                    view.timestamp
                      ? 'verified'
                      : 'pending'
                  }
                />

                <EvidenceSignal
                  icon={Camera}
                  label="Image evidence"
                  value={
                    view.imageEvidence?.captured
                      ? 'Captured'
                      : view.image
                        ? 'Available'
                        : 'Unavailable'
                  }
                  detail={
                    view.imageEvidence?.detail ||
                    'Visit image attached to audit'
                  }
                  status={
                    view.image
                      ? 'verified'
                      : 'pending'
                  }
                />

                <EvidenceSignal
                  icon={Fingerprint}
                  label="Image fingerprint"
                  value={
                    view.imageHash
                      ? 'Recorded'
                      : 'Unavailable'
                  }
                  detail={
                    view.imageHash ||
                    'No image fingerprint returned'
                  }
                  status={
                    view.imageHash
                      ? 'verified'
                      : 'pending'
                  }
                />

                <EvidenceSignal
                  icon={UserCheck}
                  label="Merchant context"
                  value={
                    view.merchantMatch?.verified
                      ? 'Matched'
                      : 'Review'
                  }
                  detail={
                    view.merchantMatch?.detail ||
                    'Merchant context supplied with visit'
                  }
                  status={
                    view.merchantMatch?.verified
                      ? 'verified'
                      : 'pending'
                  }
                />

              </div>

            </section>

            {/* ---------------------------------------------------------- */}
            {/* AI RECOMMENDATION                                            */}
            {/* ---------------------------------------------------------- */}

            <section className="card recommendation-card">

              <div className="recommendation-icon">
                <Zap size={18} />
              </div>

              <div className="eyebrow">
                AI RECOMMENDATION
              </div>

              <h3>
                {view.recommendation}
              </h3>

              <p className="mu sm">
                Recommendation generated from the
                counter-level Vision AI findings.
              </p>

              <div className="recommendation-meta">
                <Target size={13} />
                Evidence → Finding → Recommended action
              </div>

            </section>

            {/* ---------------------------------------------------------- */}
            {/* DECISION / EXECUTION                                        */}
            {/* ---------------------------------------------------------- */}

            <section className="card audit-side-card">

              <div className="audit-card-heading">

                <div>
                  <div className="eyebrow">
                    DECISION ENGINE
                  </div>

                  <h2>
                    Action Pipeline
                  </h2>
                </div>

                <Zap
                  size={18}
                  color="#1F5BFF"
                />

              </div>

              <div className="audit-evidence-list">

                <EvidenceSignal
                  icon={Target}
                  label="AI decision"
                  value={
                    view.aiDecision ||
                    (actionRequired
                      ? 'Intervention required'
                      : 'No intervention required')
                  }
                  detail={`Based on audit score ${Math.round(
                    view.score,
                  )}/100`}
                  status="verified"
                />

                <EvidenceSignal
                  icon={Sparkles}
                  label="Sarvam guidance"
                  value={
                    view.sarvamStatus ||
                    'Not executed'
                  }
                  detail="Merchant-language guidance layer"
                  status={
                    view.sarvamStatus
                      ? 'verified'
                      : 'pending'
                  }
                />

                <EvidenceSignal
                  icon={Zap}
                  label="n8n automation"
                  value={
                    view.n8nStatus ||
                    'Not executed'
                  }
                  detail="Workflow orchestration status"
                  status={
                    view.n8nStatus
                      ? 'verified'
                      : 'pending'
                  }
                />

              </div>

              <Link
                to={`/visits/${view.visitId}`}
                className="btn p"
                style={{
                  width: '100%',
                  marginTop: 12,
                  justifyContent: 'center',
                }}
              >
                Continue to Visit Evidence
                <ArrowRight size={14} />
              </Link>

            </section>

            {/* ---------------------------------------------------------- */}
            {/* INTEGRITY                                                    */}
            {/* ---------------------------------------------------------- */}

            <section className="card audit-side-card">

              <div className="eyebrow">
                EVIDENCE INTEGRITY
              </div>

              <h3 style={{ margin: '5px 0 8px' }}>
                Evidence fingerprint
              </h3>

              <p
                className="mu sm"
                style={{
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                The visit image fingerprint can be used
                to detect previously submitted evidence.
              </p>

              <div
                style={{
                  padding: 11,
                  borderRadius: 10,
                  background: '#f4f7ff',
                  border: '1px solid #dde7fb',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 10,
                  wordBreak: 'break-all',
                  color: '#52688f',
                }}
              >
                {view.imageHash ||
                  'Fingerprint unavailable'}
              </div>

            </section>

          </aside>

        </div>
      </div>
    </Layout>
  )
}