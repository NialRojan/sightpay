// What a resolved escalation did to its visit: status, decision and the actions the approval triggered
// (incentive / guidance / WhatsApp), read from the refreshed VisitOut. Styled with the Manager page's mg-* classes.
import { Link } from 'react-router-dom'
import { CheckCircle2, MessageCircle, ShieldAlert, Wallet, XCircle } from 'lucide-react'
import { DECISION_LABEL, NOTIFICATION_LABEL, STATUS_LABEL, fmtDate, fmtInr, fmtTime } from '../../services/format'

export default function VisitOutcome({ escalation, visit }) {
  if (!escalation || escalation.status === 'open') return null
  const approved = escalation.status === 'approved'
  const a = visit?.actions || {}
  const noAction = approved && visit?.audit?.recommended_action === 'retake_photo'

  return (
    <div className="mg-dsec" data-testid="escalation-outcome">
      <b>Review outcome</b>
      <div className="mg-evidence">
        <span>
          {approved ? <CheckCircle2 size={15} color="#1F5BFF" /> : <XCircle size={15} color="#DC2626" />}
          {approved ? 'Approved' : 'Rejected'} by {escalation.resolved_by || '—'}
          {escalation.resolved_at ? ` · ${fmtDate(escalation.resolved_at)} ${fmtTime(escalation.resolved_at)}` : ''}
        </span>
        <span>Visit status: <strong>{STATUS_LABEL[visit?.status] || visit?.status || '—'}</strong></span>
        <span>Decision: <strong>{DECISION_LABEL[visit?.decision] || visit?.decision || '—'}</strong></span>
        <span>Note: {escalation.note || '—'}</span>
      </div>

      {visit?.decision_reasons?.length > 0 && (
        <p className="mu sm" style={{ marginTop: 8 }}>{visit.decision_reasons.join(' · ')}</p>
      )}

      <div className="mg-ex-list" style={{ marginTop: 10 }}>
        {!approved && (
          <div className="mg-ex">
            <span className="mg-ex-ico warn"><ShieldAlert size={15} /></span>
            <div className="mg-ex-body">
              <b>Visit rejected (final)</b>
              <span>No incentive, no merchant guidance and no WhatsApp message are sent.</span>
            </div>
          </div>
        )}
        {noAction && (
          <div className="mg-ex">
            <span className="mg-ex-ico"><CheckCircle2 size={15} /></span>
            <div className="mg-ex-body">
              <b>Approved, no action</b>
              <span>The photo was unusable (retake photo), so nothing was judged and no automated action ran.</span>
            </div>
          </div>
        )}
        {a.incentive && (
          <div className="mg-ex">
            <span className="mg-ex-ico"><Wallet size={15} /></span>
            <div className="mg-ex-body">
              <span className="mg-ex-type">INCENTIVE</span>
              <b>{fmtInr(a.incentive.amount_inr)} {a.incentive.status}</b>
              <span>{a.incentive.reason}</span>
            </div>
          </div>
        )}
        {a.intervention && (
          <div className="mg-ex">
            <span className="mg-ex-ico"><MessageCircle size={15} /></span>
            <div className="mg-ex-body">
              <span className="mg-ex-type">GUIDANCE · {a.intervention.message_language}</span>
              <b>{a.intervention.issue}</b>
              <span>{a.intervention.message_text}</span>
              {a.intervention.message_text_en && a.intervention.message_text_en !== a.intervention.message_text && (
                <small className="mu">{a.intervention.message_text_en}</small>
              )}
            </div>
          </div>
        )}
        {(a.notifications || []).map((n) => (
          <div className="mg-ex" key={n.id}>
            <span className={`mg-ex-ico ${n.status === 'failed' || n.status === 'undelivered' ? 'warn' : ''}`}>
              <MessageCircle size={15} />
            </span>
            <div className="mg-ex-body">
              <span className="mg-ex-type">WHATSAPP</span>
              <b>{NOTIFICATION_LABEL[n.status] || n.status}</b>
              <span>To {n.to_phone || '—'}{n.error ? ` · ${n.error}` : ''}</span>
            </div>
          </div>
        ))}
        {approved && !noAction && !a.incentive && !a.intervention && !(a.notifications || []).length && (
          <p className="mu sm">No automated action recorded for this visit.</p>
        )}
      </div>

      {visit && (
        <p className="sm" style={{ marginTop: 10 }}>
          <Link to={`/visits/${visit.id}`} style={{ color: '#1F5BFF', fontWeight: 600 }}>
            Open full visit audit #{visit.id} →
          </Link>
        </p>
      )}
    </div>
  )
}
