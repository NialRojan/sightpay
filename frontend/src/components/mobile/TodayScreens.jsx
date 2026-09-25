// M1 identity, M2 home (coverage + performance + next best) and M3 priority queue, on real backend data.
import { ArrowLeft, ArrowRight, ChevronRight, MapPin, Navigation, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { fmtInr, fmtKm, priorityLevel, DECISION_LABEL } from '../../services/format'
import { ErrorBox, Loading } from './common'
import { greeting, initials, openIssue } from './util'

const pct = (x) => (x == null ? '—' : `${Math.round(x)}%`)

// M1: who is using the app (session.js; the backend has no auth).
export function IdentityScreen({ fse, gps, onEnter, onSwitch }) {
  return (
    <div className="m-screen m1-screen">
      <div className="m-brand">
        <div className="m-logo">
          <Zap size={24} color="#FFFFFF" />
        </div>
        <h1>SightPay FSE</h1>
        <p>Paytm Field Operations Copilot</p>
      </div>

      <div className="m1-card">
        <div className="m1-profile">
          <div className="m1-avatar">{initials(fse?.name)}</div>
          <div>
            <h3>{fse?.name || '—'}</h3>
            <span className="mu sm">ID: FSE-{fse?.id ?? '—'}</span>
          </div>
        </div>
        <div className="m1-details">
          <div>
            <span className="mu xs">ROLE</span>
            <b>Field Sales Executive</b>
          </div>
          <div>
            <span className="mu xs">TERRITORY</span>
            <b>{fse?.territory || '—'}</b>
          </div>
          <div>
            <span className="mu xs">DEVICE GPS</span>
            <b className={gps.pos ? 'lime' : 'amb'}>
              {gps.pending ? 'Locating…' : gps.pos ? `On (±${Math.round(gps.pos.accuracy || 0)} m)` : 'Unavailable'}
            </b>
          </div>
        </div>

        <button className="btn p m-full-btn" onClick={onEnter}>
          ENTER FIELD WORKSPACE <ArrowRight size={16} />
        </button>
        <button className="btn m-full-btn" onClick={onSwitch}>
          Switch rep
        </button>
      </div>

      <div className="m-foot-tag">
        <ShieldCheck size={13} /> Secured by Paytm Field Engine
      </div>
    </div>
  )
}

function ReasonList({ reasons }) {
  return (
    <div className="m2-reasons">
      {(reasons || []).map((r) => (
        <div key={r}>
          <i className="dot-lime" /> {r}
        </div>
      ))}
    </div>
  )
}

// M2: GET /fse/{id}/summary + the queue (alerts).
export function HomeScreen({ fse, summary, queue, error, onRetry, onOpenMerchant, onQueue, onIdentity }) {
  const firstName = (summary?.fse?.name || fse?.name || '').split(' ')[0]
  const cov = summary?.coverage
  const perf = summary?.performance
  const next = summary?.next_best
  const alerts = (queue || []).filter((q) => openIssue(q.reasons))

  return (
    <div className="m-screen m2-screen">
      <div className="m-header">
        <div>
          <span className="mu xs">WELCOME BACK · {(summary?.fse?.territory || fse?.territory || '').toUpperCase()}</span>
          <h2>
            {greeting()}, {firstName || 'there'}
          </h2>
        </div>
        <div className="m-avatar-sm" onClick={onIdentity} role="button">
          {initials(summary?.fse?.name || fse?.name)}
        </div>
      </div>

      <ErrorBox error={error} onRetry={onRetry} title="Could not load today's plan" />
      {!summary && !error && <Loading label="Loading today's plan…" />}

      {summary && (
        <>
          {/* Coverage KPIs (30 days) */}
          <div className="m2-kpis">
            <div className="m2-kpi">
              <b className="lime">
                {cov.visited} / {cov.assigned}
              </b>
              <span>COVERED ({pct(cov.coverage_pct)})</span>
            </div>
            <div className="m2-kpi">
              <b>{fmtInr(perf.incentives_inr)}</b>
              <span>INCENTIVES</span>
            </div>
            <div className="m2-kpi">
              <b>{perf.avg_authenticity == null ? '—' : Math.round(perf.avg_authenticity)}</b>
              <span>AVG AUTHENTICITY</span>
            </div>
          </div>
          <div className="m2-kpis">
            <div className="m2-kpi">
              <b>{perf.visits}</b>
              <span>VISITS (30D)</span>
            </div>
            <div className="m2-kpi">
              <b>{pct(perf.compliant_pct)}</b>
              <span>COMPLIANT</span>
            </div>
            <div className="m2-kpi">
              <b>{perf.conversions}</b>
              <span>CONVERSIONS</span>
            </div>
          </div>

          {/* Next Best Visit */}
          {next ? (
            <div className="m2-next-card">
              <div className="m2-next-badge">
                <Sparkles size={13} /> AI NEXT BEST VISIT
              </div>
              <h3>{next.name}</h3>
              <div className="m2-meta">
                <span>
                  <MapPin size={12} /> {next.distance_m == null ? 'Distance needs GPS' : `${fmtKm(next.distance_m)} away`}
                </span>
                <span className={`pill ${priorityLevel(next.priority)}`}>{priorityLevel(next.priority)} PRIORITY</span>
              </div>

              <ReasonList reasons={next.reasons} />

              <div className="m2-action-box">
                <span className="mu xs">RECOMMENDED ACTION</span>
                <b style={{ display: 'block' }}>
                  {openIssue(next.reasons) ? `Fix: ${openIssue(next.reasons)}` : 'Audit the counter (no open issue)'}
                </b>
              </div>

              <button className="btn p m-full-btn" onClick={() => onOpenMerchant(next.merchant_id)}>
                <Navigation size={15} /> START VISIT
              </button>
            </div>
          ) : (
            <div className="m2-next-card">
              <div className="m2-next-badge">
                <Sparkles size={13} /> AI NEXT BEST VISIT
              </div>
              <h3>All merchants visited today</h3>
              <span className="mu sm">Nothing left in your queue for today.</span>
            </div>
          )}

          {/* Priority Alerts: queue entries with an open issue */}
          <div className="m2-alerts">
            <div className="m2-alert-head">
              <span>PRIORITY ALERTS</span>
              <span className="lnk" onClick={onQueue}>
                Queue ({queue ? queue.length : '…'})
              </span>
            </div>
            {queue && alerts.length === 0 && <span className="mu sm">No open issues in your queue.</span>}
            {alerts.slice(0, 4).map((q) => (
              <div className="m2-alert-item" key={q.merchant_id} onClick={() => onOpenMerchant(q.merchant_id)} role="button">
                <span className={`pill ${priorityLevel(q.priority)}`}>{priorityLevel(q.priority)}</span>
                <div className="grow">
                  <b style={{ display: 'block' }}>{openIssue(q.reasons)}</b>
                  <span className="mu sm">{q.name}</span>
                </div>
                <ChevronRight size={16} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// M3: GET /fse/{id}/queue?lat&lng. Every reason is shown (the "priority queue reasons + distance" feature).
export function QueueScreen({ queue, error, gps, onRetry, onBack, onOpenMerchant }) {
  return (
    <div className="m-screen m3-screen">
      <div className="m-nav-head">
        <button className="m-back" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <h3>AI Priority Queue</h3>
        <span className="pill ev">{queue ? `${queue.length} Merchants` : '…'}</span>
      </div>

      <p className="mu sm m-sub">
        Ranked by SightPay priority: last QR score, days since visit, open issues, falling transactions
        {gps.pos ? ' and your distance.' : '. Distance is not used: GPS unavailable.'}
      </p>

      <ErrorBox error={error} onRetry={onRetry} title="Could not load the queue" />
      {!queue && !error && <Loading label="Ranking your merchants…" />}
      {queue && queue.length === 0 && (
        <div className="m2-alerts">
          <b>All merchants visited today</b>
          <span className="mu sm">Your queue is empty.</span>
        </div>
      )}

      <div className="m3-list">
        {(queue || []).map((q, idx) => (
          <div
            className="m3-card"
            key={q.merchant_id}
            onClick={() => onOpenMerchant(q.merchant_id)}
            style={idx === 0 ? { borderColor: '#2F80C0', boxShadow: '0 8px 22px rgba(47, 128, 192, 0.08)' } : undefined}
          >
            {idx === 0 && (
              <div className="m2-next-badge">
                <Sparkles size={13} /> AI NEXT BEST VISIT
              </div>
            )}
            <div className="m3-top">
              <span className="m3-rank">{String(idx + 1).padStart(2, '0')}</span>
              <div className="grow">
                <h4>{q.name}</h4>
                <span className="mu sm">
                  <MapPin size={11} /> {q.distance_m == null ? 'No GPS' : fmtKm(q.distance_m)} · {q.owner_name}
                </span>
              </div>
              <div className="m3-score-ring">
                <b>{Math.round(q.priority)}</b>
                <span className="mu xs" style={{ display: 'block' }}>
                  PRIORITY
                </span>
              </div>
            </div>

            <div className="m3-tags">
              <span className={`pill ${priorityLevel(q.priority)}`}>{priorityLevel(q.priority)}</span>
              <span className="pill ev">QR {q.latest_score == null ? '—' : `${q.latest_score}/100`}</span>
              {q.latest_decision && <span className="pill ev">{DECISION_LABEL[q.latest_decision]}</span>}
              <span className="pill ev">
                {q.days_since_visit == null ? 'Never visited' : `${q.days_since_visit}d since visit`}
              </span>
            </div>

            <div className="m3-reason">
              <span className="mu xs">REASONS:</span>
              <ReasonList reasons={q.reasons} />
            </div>

            <div className="m3-cta">
              <span>
                Action: <b>{openIssue(q.reasons) || 'Routine audit'}</b>
              </span>
              <ChevronRight size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
