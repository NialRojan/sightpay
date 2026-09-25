// M6: the visit outcome (VisitOut), branching on status/decision.
import { ArrowLeft, Ban, CheckCircle2, ExternalLink, Languages, MessageCircle, RotateCcw, ShieldCheck, Store, TrendingUp, UserCheck, Volume2, Wallet } from 'lucide-react'
import { ACTION_LABEL, DECISION_LABEL, NOTIFICATION_LABEL, SIGNAL_LABEL, STATUS_LABEL, STEP_LABEL, fmtInr } from '../../services/format'
import { visitPhotoUrl } from '../../services/visits'
import { AudioPlayer, ErrorBox } from './common'
import { LANGUAGE_NAME } from './util'

export function OutcomeScreen({ visit, retrying, retryError, onRetry, onBack, onNextMerchant, onOpenAudit, onImpact }) {
  if (!visit) {
    return (
      <div className="m-screen m6-screen">
        <Head onBack={onBack} />
        <div className="m6-card">
          <div className="m5-evidence-unavailable">
            <Store size={28} />
            <b>No visit yet</b>
            <span className="mu sm">Open a merchant from the queue and capture a counter photo first.</span>
          </div>
          <button className="btn p m-full-btn" onClick={onNextMerchant}>
            OPEN QUEUE
          </button>
        </div>
      </div>
    )
  }

  const { audit, authenticity: auth, actions, decision, status } = visit
  const inc = actions?.incentive
  const iv = actions?.intervention
  const esc = actions?.escalation
  const notes = actions?.notifications || []
  const photo = visitPhotoUrl(visit)
  const failingSignals = (auth?.signals || []).filter((s) => s.status !== 'pass')
  const errorStep = [...(visit.pipeline_log || [])].reverse().find((s) => s.step === 'error')

  return (
    <div className="m-screen m6-screen">
      <Head onBack={onBack} confidence={audit?.confidence} />

      <div className="m6-card">
        {/* Evidence: thumbnail + authenticity */}
        <div className="m5-authenticity">
          {photo ? (
            <img src={photo} alt="Submitted counter" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />
          ) : (
            <ShieldCheck size={16} color="#B7FF3C" />
          )}
          <div>
            <b>
              Authenticity {auth ? `${auth.score} / 100 · ${auth.verdict}` : '—'}
            </b>
            <span className="mu xs" style={{ display: 'block' }}>
              Combined evidence signals · Visit #{visit.id} · {visit.merchant_name}
            </span>
            <span className="mu xs" style={{ display: 'block' }}>
              {STATUS_LABEL[status] || status}
              {decision ? ` · ${DECISION_LABEL[decision]}` : ''}
            </span>
          </div>
        </div>

        {/* compliant -> incentive */}
        {decision === 'compliant' && (
          <div className="m6-incentive">
            <Wallet size={16} color="#B7FF3C" />
            <div>
              <b>{inc ? `Incentive approved: ${fmtInr(inc.amount_inr)}` : 'Compliant: no incentive recorded'}</b>
              <span className="mu xs" style={{ display: 'block' }}>
                {inc ? `${inc.reason} · ${inc.status}` : ''}
              </span>
            </div>
          </div>
        )}

        {/* decision reasons */}
        {decision !== 'compliant' && decision !== 'fraud' && (visit.decision_reasons || []).length > 0 && (
          <div className="m6-issue">
            <span className="mu xs">DETECTED ISSUE</span>
            <p style={{ margin: '4px 0 0' }}>{visit.decision_reasons.join('; ')}</p>
          </div>
        )}

        {/* fraud -> blocked with the authenticity breakdown */}
        {decision === 'fraud' && (
          <div className="m6-issue">
            <span className="mu xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Ban size={12} /> VISIT BLOCKED · AUTHENTICITY {auth?.score ?? '—'} / 100
            </span>
            {(visit.decision_reasons || []).length > 0 && <p style={{ margin: '4px 0 0' }}>{visit.decision_reasons.join('; ')}</p>}
            {failingSignals.map((s) => (
              <p key={s.signal} style={{ margin: '4px 0 0' }}>
                <b>{SIGNAL_LABEL[s.signal] || s.signal}</b> ({s.status}, −{s.penalty}): {s.detail}
              </p>
            ))}
            <p className="mu xs" style={{ margin: '6px 0 0', fontSize: 11 }}>No incentive, no guidance. Listed for manager fraud review.</p>
          </div>
        )}

        {/* low_confidence -> escalated */}
        {(status === 'escalated' || decision === 'low_confidence') && (
          <div className="m2-action-box">
            <span className="mu xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <UserCheck size={12} /> ESCALATED TO MANAGER
            </span>
            <b style={{ display: 'block', marginTop: 4 }}>{esc?.reason || 'Sent to manager for review'}</b>
            {esc?.status && <span className="mu xs">Escalation #{esc.id} · {esc.status}</span>}
          </div>
        )}

        {status === 'rejected' && (
          <div className="m6-issue">
            <span className="mu xs">REJECTED BY MANAGER</span>
          </div>
        )}

        {/* failed -> retry */}
        {status === 'failed' && (
          <div className="m6-issue">
            <span className="mu xs">PIPELINE FAILED</span>
            <p style={{ margin: '4px 0 0' }}>{errorStep?.summary || 'The analysis did not finish.'}</p>
            <button className="btn m-full-btn" disabled={retrying} onClick={onRetry}>
              <RotateCcw size={14} /> {retrying ? 'Retrying…' : 'Retry analysis'}
            </button>
          </div>
        )}
        <ErrorBox error={retryError} title="Retry failed" />

        {/* non_compliant -> guidance + voice note + WhatsApp */}
        {iv && (
          <>
            <div className="m6-recommendation">
              <span className="mu xs">RECOMMENDED ACTION</span>
              <h4>{iv.issue || ACTION_LABEL[iv.action] || iv.action}</h4>
            </div>

            <div className="m6-guidance">
              <div className="m6-g-head">
                <Languages size={14} color="#B7FF3C" />
                <span>MERCHANT GUIDANCE ({(LANGUAGE_NAME[iv.message_language] || iv.message_language || '').toUpperCase()})</span>
              </div>
              <p className="m6-hindi" lang={iv.message_language}>“{iv.message_text}”</p>
              {iv.message_text_en && iv.message_text_en !== iv.message_text && (
                <p className="mu sm" style={{ margin: 0, fontSize: 12 }}>
                  <b>English:</b> {iv.message_text_en}
                </p>
              )}
              {iv.audio_url ? (
                <AudioPlayer url={iv.audio_url} label="Voice note for the merchant" />
              ) : (
                <div className="m6-audio-status">
                  <Volume2 size={14} /> Text guidance only (no voice note generated)
                </div>
              )}
            </div>

            <div className="m6-guidance">
              <div className="m6-g-head">
                <MessageCircle size={14} />
                <span>WHATSAPP TO MERCHANT</span>
              </div>
              {notes.length === 0 && <span className="mu sm">No WhatsApp message recorded.</span>}
              {notes.map((n) => (
                <div key={n.id} style={{ display: 'grid', gap: 2, fontSize: 12 }}>
                  <span>
                    <span className={`pill ${['failed', 'undelivered'].includes(n.status) ? 'HIGH' : 'ev'}`}>
                      {NOTIFICATION_LABEL[n.status] || n.status}
                    </span>{' '}
                    to {n.to_phone}
                  </span>
                  {n.error && <span className="red">{n.error}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* The real pipeline that ran */}
        <div className="m6-pipeline">
          <span className="mu xs">EXECUTION PIPELINE ({visit.pipeline_mode || '—'})</span>
          <div className="m6-pipe-flow">
            {(visit.pipeline_log || []).map((s, i) => (
              <span key={`${s.step}-${i}`}>
                {i > 0 && '→ '}
                {STEP_LABEL[s.step] || s.step}
              </span>
            ))}
          </div>
        </div>

        <div className="m6-done-box">
          <CheckCircle2 size={24} color="#B7FF3C" />
          <h3>Visit recorded</h3>
          <p className="mu sm" style={{ fontSize: 12 }}>
            Merchant memory updated.
            {iv ? ' Transactions after this guidance are tracked as an observed change (not proof of cause).' : ''}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
            <button className="btn p m-full-btn" onClick={onNextMerchant}>
              NEXT MERCHANT
            </button>
            <button className="btn m-full-btn" onClick={onOpenAudit}>
              <ExternalLink size={14} /> FULL AUDIT
            </button>
          </div>
          {iv && (
            <button className="btn m-full-btn" onClick={onImpact}>
              <TrendingUp size={15} /> VIEW IMPACT ANALYTICS
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Head({ onBack, confidence }) {
  return (
    <div className="m-nav-head">
      <button className="m-back" onClick={onBack}>
        <ArrowLeft size={18} />
      </button>
      <h3>AI Intervention</h3>
      {confidence != null && <span className="pill HIGH">{Math.round(confidence * 100)}% Confidence</span>}
    </div>
  )
}
