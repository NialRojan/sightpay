// M4: one merchant. GET /merchants/{id} (+ its latest visit for the Soundbox cell) and GET /merchants/{id}/impact.
import { ArrowLeft, Brain, Camera, Compass, MapPin, TrendingUp } from 'lucide-react'
import { DECISION_LABEL, fmtDate, fmtPct, priorityLevel } from '../../services/format'
import { ErrorBox, Loading } from './common'
import { GEOFENCE_M, LANGUAGE_NAME, distanceM } from './util'

// Impact dates are plain YYYY-MM-DD.
const fmtDay = (d) => (d ? fmtDate(`${d}T00:00:00`) : '—')

const SOURCE_LABEL = { sql: 'SQL', cognee: 'Cognee', sql_fallback: 'SQL fallback' }

export function MerchantScreen({ detail, latestVisit, impact, impactError, error, gps, queueEntry, onRetry, onBack, onCapture }) {
  if (error) {
    return (
      <div className="m-screen m4-screen">
        <Head onBack={onBack} />
        <ErrorBox error={error} onRetry={onRetry} title="Could not load the merchant" />
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="m-screen m4-screen">
        <Head onBack={onBack} />
        <Loading label="Loading merchant…" />
      </div>
    )
  }

  const { merchant: m, context: ctx } = detail
  const dist = distanceM(gps.pos, m)
  const inside = dist != null && dist <= GEOFENCE_M
  const lvl = queueEntry ? priorityLevel(queueEntry.priority) : null
  const audit = latestVisit?.audit

  return (
    <div className="m-screen m4-screen">
      <Head onBack={onBack} pill={lvl} />

      <div className="m4-card">
        <h2>{m.name}</h2>
        <p className="mu sm">
          <MapPin size={12} /> {m.address}
        </p>
        <p className="mu sm" style={{ marginTop: -8 }}>
          {m.owner_name} · {m.category} · {LANGUAGE_NAME[m.language] || m.language}
        </p>

        <div className="m4-geofence">
          <div className="m4-geo-icon">
            <Compass size={18} color="#B7FF3C" />
          </div>
          {gps.pos ? (
            <div>
              <b>{dist} m away</b> ·{' '}
              <span className={inside ? 'lime' : 'amb'}>
                {inside ? `INSIDE ${GEOFENCE_M}m GEOFENCE` : `OUTSIDE ${GEOFENCE_M}m GEOFENCE`}
              </span>
              <div className="mu xs">
                GPS CAPTURED ({gps.pos.lat.toFixed(4)} N, {gps.pos.lng.toFixed(4)} E)
              </div>
            </div>
          ) : (
            <div>
              <b>{gps.pending ? 'Locating…' : 'GPS unavailable'}</b>
              <div className="mu xs">
                {gps.pending ? 'Waiting for device location' : 'Location needs https or localhost; you can choose on capture'}
              </div>
            </div>
          )}
        </div>

        <div className="m4-history">
          <div>
            <span className="mu xs">LAST VISIT</span>
            <b style={{ display: 'block' }}>{m.last_visit_at ? fmtDate(m.last_visit_at) : 'Never'}</b>
          </div>
          <div>
            <span className="mu xs">PREVIOUS ISSUE</span>
            <b className={ctx.previous_issues?.[0] ? 'red' : ''} style={{ display: 'block' }}>
              {ctx.previous_issues?.[0] || 'None'}
            </b>
          </div>
          <div>
            <span className="mu xs">QR SCORE</span>
            <b style={{ display: 'block' }}>{m.latest_score == null ? '—' : `${m.latest_score} / 100`}</b>
          </div>
          <div>
            <span className="mu xs">SOUNDBOX</span>
            <b style={{ display: 'block' }}>
              {audit ? (audit.soundbox_visible ? 'Visible' : 'Not visible') : '—'}
            </b>
          </div>
          <div>
            <span className="mu xs">LAST DECISION</span>
            <b style={{ display: 'block' }}>{m.latest_decision ? DECISION_LABEL[m.latest_decision] : '—'}</b>
          </div>
          <div>
            <span className="mu xs">NOT FIXED FOR</span>
            <b style={{ display: 'block' }}>{ctx.consecutive_non_compliant ?? 0} visit(s)</b>
          </div>
        </div>

        {/* Merchant memory */}
        <div className="m6-guidance">
          <div className="m6-g-head">
            <Brain size={14} />
            <span>MERCHANT MEMORY ({SOURCE_LABEL[ctx.source] || ctx.source})</span>
          </div>
          <p className="m6-hindi" style={{ fontWeight: 500, fontSize: 12 }}>
            {ctx.summary || 'No memory yet for this merchant.'}
          </p>
        </div>

        {/* Observed change (never causal) */}
        <ObservedChange impact={impact} error={impactError} />

        <button className="btn p m-full-btn top16" onClick={onCapture}>
          <Camera size={16} /> START AUDIT & CAPTURE
        </button>
      </div>
    </div>
  )
}

function Head({ onBack, pill }) {
  return (
    <div className="m-nav-head">
      <button className="m-back" onClick={onBack}>
        <ArrowLeft size={18} />
      </button>
      <h3>Merchant Visit</h3>
      {pill && <span className={`pill ${pill}`}>{pill}</span>}
    </div>
  )
}

function ObservedChange({ impact, error }) {
  if (error) return <ErrorBox error={error} title="Observed change unavailable" />
  if (!impact) return null
  if (!impact.intervention) {
    return (
      <div className="m2-action-box">
        <span className="mu xs">OBSERVED CHANGE</span>
        <b style={{ display: 'block' }}>No guidance sent yet</b>
      </div>
    )
  }
  const imp = impact.impact
  const ok = imp?.status === 'ok'
  return (
    <div className="m2-action-box">
      <span className="mu xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <TrendingUp size={12} /> OBSERVED CHANGE SINCE GUIDANCE ({impact.intervention.issue}, {fmtDay(impact.intervention.date)})
      </span>
      <b style={{ display: 'block', margin: '4px 0' }}>
        {ok ? `${fmtPct(imp.change_pct)} daily sales` : 'Not enough data yet'}
      </b>
      {impact.newer_intervention_pending && (
        <span className="mu xs" style={{ display: 'block' }}>
          New guidance sent {fmtDay(impact.newer_intervention_pending.date)}, still collecting data.
        </span>
      )}
      <span className="mu xs" style={{ display: 'block' }}>
        {impact.caveat}
      </span>
    </div>
  )
}
