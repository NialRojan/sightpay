// Before/after daily transaction chart for GET /merchants/{id}/impact. Plain SVG bars in the Merchant 360 chart
// style (.big-chart / .chart-legend, colours from sightpay.css variables). The backend `caveat` is shown verbatim.
import { fmtDate, fmtInr, fmtPct, ACTION_LABEL } from '../../services/format'

const PHASE_FILL = { baseline: 'var(--sky)', intervention: 'var(--red)', post: 'var(--lime)' }

export default function ImpactChart({ data }) {
  if (!data) return null
  const { intervention, impact, series = [], newer_intervention_pending: pending, caveat } = data

  if (!intervention) {
    return (
      <div className="chart-placeholder">
        <p className="mu sm">No guidance has been sent to this merchant yet, so there is no before/after window to show.</p>
      </div>
    )
  }

  const W = 600
  const H = 200
  const top = 12
  const bottom = 186
  const max = Math.max(...series.map((s) => s.amount_inr || 0), 1) * 1.08
  const bw = series.length ? W / series.length : W
  const y = (v) => bottom - (v / max) * (bottom - top)
  const ivIdx = series.findIndex((s) => s.phase === 'intervention')
  const baseline = impact?.baseline_avg_daily_inr
  const post = impact?.post_avg_daily_inr
  const insufficient = impact?.status === 'insufficient_data'

  return (
    <div className="chart-placeholder">
      <p className="mu sm">
        Guidance “{intervention.issue || ACTION_LABEL[intervention.action] || intervention.action}” sent{' '}
        <b>{fmtDate(intervention.date)}</b>
        {intervention.visit_id ? ` (visit #${intervention.visit_id})` : ''}. Baseline = up to 14 days before, post = up to
        14 days after; the intervention day itself is excluded.
      </p>

      {pending && (
        <div className="pending-strip">
          A newer intervention on {fmtDate(pending.date)} ({pending.issue || ACTION_LABEL[pending.action] || pending.action}) is
          still collecting data.
        </div>
      )}

      {series.length > 0 ? (
        <svg className="big-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
          aria-label="Daily transaction value before and after the intervention">
          {[top, (top + bottom) / 2, bottom].map((ly) => (
            <line key={ly} x1="0" y1={ly} x2={W} y2={ly} stroke="rgba(31, 91, 255, 0.08)" />
          ))}
          {series.map((s, i) => (
            <rect key={s.date} x={i * bw + bw * 0.15} width={bw * 0.7} y={y(s.amount_inr || 0)}
              height={Math.max(bottom - y(s.amount_inr || 0), 0)} fill={PHASE_FILL[s.phase] || 'var(--sky)'}
              opacity={s.phase === 'baseline' ? 0.85 : 1}>
              <title>{`${fmtDate(s.date)}: ${fmtInr(s.amount_inr)} · ${s.txn_count} txns (${s.phase})`}</title>
            </rect>
          ))}
          {ivIdx >= 0 && (
            <line x1={ivIdx * bw + bw / 2} x2={ivIdx * bw + bw / 2} y1={0} y2={H} stroke="var(--red)" strokeWidth="2"
              strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          {baseline != null && ivIdx > 0 && (
            <line x1={0} x2={ivIdx * bw} y1={y(baseline)} y2={y(baseline)} stroke="var(--navy)" strokeWidth="2"
              strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          )}
          {post != null && ivIdx >= 0 && (
            <line x1={(ivIdx + 1) * bw} x2={W} y1={y(post)} y2={y(post)} stroke="var(--navy)" strokeWidth="2"
              strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      ) : (
        <p className="mu sm">No transactions recorded around this date.</p>
      )}

      <div className="chart-legend">
        <span><i className="l-sky" /> Baseline days</span>
        <span><i className="l-red" /> Intervention day ({fmtDate(intervention.date)})</span>
        <span><i className="l-lime" /> Post days</span>
        <span><i style={{ background: 'var(--navy)' }} /> Window average</span>
        {series.length > 0 && (
          <span className="grow" style={{ textAlign: 'right' }}>{fmtDate(series[0].date)} – {fmtDate(series.at(-1).date)}</span>
        )}
      </div>

      <div className="impact-stats">
        <div>
          <span className="mu xs">BASELINE AVG / DAY</span>
          <b>{fmtInr(baseline)}</b>
          <span className="mu xs">{impact?.baseline_days ?? 0} days · {impact?.baseline_avg_txn_count ?? '—'} txns/day</span>
        </div>
        <div>
          <span className="mu xs">POST AVG / DAY</span>
          <b>{fmtInr(post)}</b>
          <span className="mu xs">{impact?.post_days ?? 0} days · {impact?.post_avg_txn_count ?? '—'} txns/day</span>
        </div>
        <div>
          <span className="mu xs">OBSERVED CHANGE</span>
          <b className={insufficient ? '' : (impact?.change_pct ?? 0) >= 0 ? 'lime' : 'red'}>
            {insufficient ? 'Not enough data yet' : fmtPct(impact?.change_pct)}
          </b>
          <span className="mu xs">
            {insufficient
              ? `${impact?.post_days ?? 0} day(s) after, ${impact?.baseline_days ?? 0} before (needs 3 each)`
              : `${impact?.change_inr >= 0 ? '+' : '−'}${fmtInr(Math.abs(impact?.change_inr ?? 0))} per day`}
          </span>
        </div>
      </div>

      <p className="mu xs caveat">{impact?.caveat || caveat}</p>
    </div>
  )
}
