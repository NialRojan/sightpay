import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  Info,
  LineChart as LineChartIcon,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'

import Layout from '../components/Layout'
import { getDashboard, getPortfolioImpact, getSystemHealth } from '../services/analytics'
import { getMerchantDetail, getMerchantImpact, listMerchants } from '../services/merchants'
import { getVisitAudit } from '../services/audits'
import { listTransactions } from '../services/transactions'
import { listFse, getFseSummary } from '../services/fse'
import { ACTION_LABEL, DECISION_LABEL, fmtDate, fmtInr, fmtPct } from '../services/format'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

// The range drives the "Transaction movement" chart: GET /transactions?merchant_id=&days=
const RANGE_OPTIONS = [
  { label: 'Last 7 Days', value: 7 },
  { label: 'Last 14 Days', value: 14 },
  { label: 'Last 30 Days', value: 30 },
]

const safeValue = (value) =>
  value === undefined || value === null || value === ''
    ? '—'
    : value

const clamp = (n, min, max) =>
  Math.max(min, Math.min(max, n))

const errText = (e) => (e ? e.detail || e.message || String(e) : '')

const fmtDay = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''

const signedPts = (a, b) => {
  if (a == null || b == null) return '—'
  const d = b - a
  return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} pts`
}

/* -------------------------------------------------------------------------- */
/* Chart                                                                      */
/* -------------------------------------------------------------------------- */

function ImpactChart({
  values = [],
  labels = [],
  selectedPoint,
  onSelectPoint,
  beforeAfter = false,
  interventionIndex = null,
  formatValue = (v) => `${v} / day`,
  emptyText = 'No measurement data available.',
}) {
  const series = beforeAfter
    ? values.filter(Array.isArray)
    : [values]

  const flattened = series.flat().map(Number).filter(Number.isFinite)

  if (!flattened.length) {
    return (
      <div className="analytics-empty-chart">
        <LineChartIcon size={22} />
        <span>{emptyText}</span>
      </div>
    )
  }

  const maxValue = Math.max(...flattened, 10)
  const minValue = 0

  const width = 760
  const height = 270
  const chartTop = 24
  const chartBottom = 220
  const chartHeight = chartBottom - chartTop

  const getX = (index, length) =>
    length <= 1
      ? width / 2
      : (index / (length - 1)) * width

  const getY = (value) =>
    chartBottom -
    ((Number(value) - minValue) /
      Math.max(maxValue - minValue, 1)) *
      chartHeight

  const makePoints = (arr) =>
    arr
      .map(
        (value, index) =>
          `${getX(index, arr.length)},${getY(value)}`,
      )
      .join(' ')

  const observedSeries = beforeAfter
    ? series[1] || series[0] || []
    : values

  const points = observedSeries.map((value, index) => ({
    value,
    index,
    x: getX(index, observedSeries.length),
    y: getY(value),
    label:
      labels[index] ||
      `Day ${index + 1}`,
  }))

  const interventionX =
    interventionIndex !== null && observedSeries.length > 1
      ? getX(interventionIndex, observedSeries.length)
      : beforeAfter && observedSeries.length > 1
        ? width / 2
        : null

  return (
    <div className="analytics-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Transaction outcome chart"
      >
        <defs>
          <linearGradient
            id="sightpayArea"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#1F5BFF"
              stopOpacity=".18"
            />
            <stop
              offset="100%"
              stopColor="#1F5BFF"
              stopOpacity="0"
            />
          </linearGradient>

          <filter
            id="sightpayGlow"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur
              stdDeviation="3"
              result="blur"
            />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0, 25, 50, 75, 100].map(
          (percentage) => {
            const y =
              chartBottom -
              (percentage / 100) *
                chartHeight

            return (
              <g key={percentage}>
                <line
                  x1="0"
                  x2={width}
                  y1={y}
                  y2={y}
                  className="analytics-grid-line"
                />

                <text
                  x="8"
                  y={y - 7}
                  className="analytics-axis-label"
                >
                  {Math.round(
                    (percentage / 100) *
                      maxValue,
                  )}
                </text>
              </g>
            )
          },
        )}

        {beforeAfter &&
          series[0]?.length > 0 && (
            <polyline
              points={makePoints(series[0])}
              className="analytics-baseline"
            />
          )}

        {observedSeries.length > 1 && (
          <polygon
            points={`0,${chartBottom} ${makePoints(
              observedSeries,
            )} ${width},${chartBottom}`}
            fill="url(#sightpayArea)"
          />
        )}

        {observedSeries.length > 0 && (
          <polyline
            points={makePoints(observedSeries)}
            className="analytics-observed-line"
            filter="url(#sightpayGlow)"
          />
        )}

        {interventionX !== null && (
          <>
            <line
              x1={interventionX}
              x2={interventionX}
              y1={chartTop}
              y2={chartBottom}
              className="analytics-intervention-line"
            />

            <rect
              x={clamp(interventionX - 51, 0, width - 102)}
              y="4"
              width="102"
              height="24"
              rx="12"
              className="analytics-intervention-bg"
            />

            <text
              x={clamp(interventionX, 51, width - 51)}
              y="20"
              textAnchor="middle"
              className="analytics-intervention-label"
            >
              INTERVENTION
            </text>
          </>
        )}

        {points.map((point) => (
          <g
            key={point.index}
            className="analytics-point"
            onClick={() =>
              onSelectPoint?.(
                selectedPoint ===
                  point.index
                  ? null
                  : point.index,
              )
            }
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={
                selectedPoint ===
                point.index
                  ? 7
                  : 4
              }
              className="analytics-point-dot"
            />

            <circle
              cx={point.x}
              cy={point.y}
              r="15"
              className="analytics-point-hit"
            />

            {selectedPoint ===
              point.index && (
              <g>
                <rect
                  x={clamp(
                    point.x - 65,
                    2,
                    width - 132,
                  )}
                  y={clamp(
                    point.y - 62,
                    8,
                    chartBottom - 58,
                  )}
                  width="130"
                  height="48"
                  rx="10"
                  className="analytics-tooltip"
                />

                <text
                  x={clamp(
                    point.x,
                    67,
                    width - 67,
                  )}
                  y={clamp(
                    point.y - 41,
                    28,
                    chartBottom - 34,
                  )}
                  textAnchor="middle"
                  className="analytics-tooltip-label"
                >
                  {point.label}
                </text>

                <text
                  x={clamp(
                    point.x,
                    67,
                    width - 67,
                  )}
                  y={clamp(
                    point.y - 21,
                    47,
                    chartBottom - 15,
                  )}
                  textAnchor="middle"
                  className="analytics-tooltip-value"
                >
                  {formatValue(point.value)}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>

      {labels.length > 0 && (
        <div className="analytics-chart-labels">
          {labels.map((label, index) => (
            <button
              key={`${label}-${index}`}
              className={
                selectedPoint === index
                  ? 'active'
                  : ''
              }
              onClick={() =>
                onSelectPoint?.(
                  selectedPoint ===
                    index
                    ? null
                    : index,
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* KPI                                                                        */
/* -------------------------------------------------------------------------- */

function ImpactKpi({
  label,
  value,
  icon: Icon,
  detail,
  active,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`analytics-kpi ${
        active ? 'active' : ''
      }`}
      onClick={onClick}
    >
      <div className="analytics-kpi-top">
        <span>{label}</span>

        <span className="analytics-kpi-icon">
          <Icon size={16} />
        </span>
      </div>

      <strong>{safeValue(value)}</strong>

      <small>{detail}</small>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Intervention table                                                        */
/* -------------------------------------------------------------------------- */

// rows: [{key, label, merchants, positive, latest, avg}] built from /analytics/impact by_action + merchants[]
function InterventionTable({
  rows = [],
  selected,
  onSelect,
}) {
  if (!rows.length) {
    return (
      <div className="analytics-empty">
        <BarChart3 size={20} />
        <span>
          No intervention outcome data available.
        </span>
      </div>
    )
  }

  return (
    <div className="analytics-table">
      <div className="analytics-table-head">
        <span>INTERVENTION</span>
        <span>MERCHANTS MEASURED</span>
        <span>POSITIVE CHANGE</span>
        <span>LATEST</span>
        <span>AVG OBSERVED CHANGE</span>
      </div>

      {rows.map((row, index) => (
        <button
          type="button"
          key={row.key}
          className={`analytics-table-row ${
            selected === index
              ? 'selected'
              : ''
          }`}
          onClick={() =>
            onSelect(index)
          }
        >
          <span className="analytics-intervention-name">
            <i />
            {safeValue(row.label)}
          </span>

          <span>
            {safeValue(row.merchants)}
          </span>

          <span>
            {safeValue(row.positive)}
          </span>

          <span>
            {row.latest ? fmtDate(row.latest) : '—'}
          </span>

          <span
            className={
              row.avg > 0
                ? 'analytics-positive'
                : ''
            }
          >
            {row.avg > 0 && (
              <ArrowUpRight size={14} />
            )}

            {fmtPct(row.avg)}
          </span>
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Pending measurement drawer                                                */
/* -------------------------------------------------------------------------- */

// Interventions still collecting post data: GET /merchants/{id}/impact for every merchant
// (newer_intervention_pending, or a latest intervention with status insufficient_data).
function PendingDrawer({
  open,
  onClose,
}) {
  if (!open) return null

  return (
    <>
      <div
        className="analytics-drawer-backdrop"
        onClick={onClose}
      />

      <aside className="analytics-drawer">
        <div className="analytics-drawer-head">
          <div>
            <span className="analytics-mini-label">
              MEASUREMENT QUEUE
            </span>

            <h2>
              Pending outcomes
            </h2>

            <p>
              Interventions waiting for enough
              transaction observations (at least
              3 days after the intervention).
            </p>
          </div>

          <button
            className="analytics-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <PendingItems />

        <button
          className="analytics-primary-button"
          onClick={onClose}
        >
          Close
        </button>
      </aside>
    </>
  )
}

function PendingItems() {
  const [state, setState] = useState({ rows: null, error: null })

  useEffect(() => {
    let alive = true
    listMerchants()
      .then((merchants) =>
        Promise.all(
          merchants.map((m) =>
            getMerchantImpact(m.id).then((r) => ({ m, r })),
          ),
        ),
      )
      .then((all) => {
        const rows = []
        all.forEach(({ m, r }) => {
          if (r.newer_intervention_pending) {
            rows.push({ id: m.id, name: m.name, iv: r.newer_intervention_pending, why: 'New guidance, still collecting data' })
          } else if (r.impact?.status === 'insufficient_data' && r.intervention) {
            rows.push({
              id: m.id,
              name: m.name,
              iv: r.intervention,
              why: `Not enough data yet (${r.impact.post_days} days after)`,
            })
          }
        })
        rows.sort((a, b) => String(b.iv.date).localeCompare(String(a.iv.date)))
        if (alive) setState({ rows, error: null })
      })
      .catch((error) => alive && setState({ rows: null, error }))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
        <div className="analytics-pending-list">
          {state.error && (
            <div className="analytics-pending-item">
              <div className="analytics-pending-icon">
                <Info size={16} />
              </div>
              <div>
                <strong>Could not load the measurement queue</strong>
                <span>{errText(state.error)}</span>
              </div>
            </div>
          )}

          {!state.rows && !state.error && (
            <div className="analytics-pending-item">
              <div className="analytics-pending-icon">
                <Clock3 size={16} />
              </div>
              <div>
                <strong>Checking every merchant…</strong>
                <span>Reading each merchant&apos;s latest intervention window.</span>
              </div>
            </div>
          )}

          {state.rows && !state.rows.length && (
            <div className="analytics-pending-item">
              <div className="analytics-pending-icon">
                <Clock3 size={16} />
              </div>
              <div>
                <strong>Nothing pending</strong>
                <span>Every recent intervention already has a measurement window.</span>
              </div>
            </div>
          )}

          {(state.rows || []).map((row) => (
            <Link
              key={`${row.id}-${row.iv.id}`}
              to={`/merchants/${row.id}`}
              className="analytics-pending-item"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="analytics-pending-icon">
                <Clock3 size={16} />
              </div>

              <div>
                <strong>
                  {row.name} · {row.iv.issue || ACTION_LABEL[row.iv.action] || row.iv.action}
                </strong>

                <span>
                  {row.why} · sent {fmtDate(row.iv.date)}
                </span>
              </div>
            </Link>
          ))}

          <div className="analytics-pending-item">
            <div className="analytics-pending-icon">
              <Target size={16} />
            </div>

            <div>
              <strong>
                Outcome remains observational
              </strong>

              <span>
                SightPay reports post-intervention
                change rather than causal attribution.
              </span>
            </div>
          </div>
        </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

export default function Analytics() {
  // Portfolio: GET /analytics/impact, GET /dashboard, GET /health, rep summaries (conversions)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [reload, setReload] = useState(0)

  const [range, setRange] = useState(14)
  const [rangeOpen, setRangeOpen] =
    useState(false)
  const [selectedPoint, setSelectedPoint] =
    useState(null)
  const [trendPoint, setTrendPoint] =
    useState(null)
  const [
    selectedIntervention,
    setSelectedIntervention,
  ] = useState(0)
  const [selectedKpi, setSelectedKpi] =
    useState('change')
  const [pendingOpen, setPendingOpen] =
    useState(false)
  const [methodologyOpen, setMethodologyOpen] =
    useState(false)

  // Selected merchant: GET /merchants/{id}/impact + detail + audits + transactions
  const [merchantId, setMerchantId] = useState(null)
  const [focusState, setFocusState] = useState({ id: null, value: null, error: null })
  const [txnState, setTxnState] = useState({ key: null, rows: null, error: null })
  const focus = focusState.id === merchantId ? focusState.value : null
  const focusError = focusState.id === merchantId ? focusState.error : null
  const txnKey = `${merchantId}:${range}`
  const txns = txnState.key === txnKey ? txnState.rows : null
  const txnError = txnState.key === txnKey ? txnState.error : null

  const selectMerchant = (id) => {
    setMerchantId(id)
    setSelectedPoint(null)
    setTrendPoint(null)
  }

  useEffect(() => {
    let mounted = true

    Promise.all([
      getPortfolioImpact(),
      getDashboard(),
      getSystemHealth().catch((e) => ({ error: e })),
      listFse()
        .then((reps) => Promise.all(reps.map((r) => getFseSummary(r.id))))
        .catch((e) => ({ error: e })),
    ])
      .then(([impact, dash, health, summaries]) => {
        if (!mounted) return
        setData({ impact, dash, health, summaries })
        setLoadError(null)
        setMerchantId((cur) => cur ?? impact.merchants?.[0]?.merchant_id ?? null)
      })
      .catch((e) => {
        if (mounted) setLoadError(e)
      })

    return () => {
      mounted = false
    }
  }, [reload])

  useEffect(() => {
    if (!merchantId) return undefined
    let alive = true
    ;(async () => {
      const [imp, detail] = await Promise.all([
        getMerchantImpact(merchantId),
        getMerchantDetail(merchantId),
      ])
      const ivVisitId = imp.intervention?.visit_id
      const beforeVisit = detail.recent_visits?.find((v) => v.id === ivVisitId) || null
      // newest usable audit after the intervention visit (skip rejected / unusable / in-flight visits)
      const afterVisit =
        detail.recent_visits?.find(
          (v) =>
            v.id !== ivVisitId &&
            v.status === 'completed' &&
            ['compliant', 'non_compliant'].includes(v.decision) &&
            (!beforeVisit || String(v.received_at) > String(beforeVisit.received_at)),
        ) || null
      const audit = (id) => (id ? getVisitAudit(id).catch(() => null) : Promise.resolve(null))
      const [auditBefore, auditAfter] = await Promise.all([audit(ivVisitId), audit(afterVisit?.id)])
      return { imp, detail, beforeVisit, afterVisit, auditBefore, auditAfter }
    })()
      .then((f) => alive && setFocusState({ id: merchantId, value: f, error: null }))
      .catch((e) => alive && setFocusState({ id: merchantId, value: null, error: e }))
    return () => {
      alive = false
    }
  }, [merchantId])

  useEffect(() => {
    if (!merchantId) return undefined
    let alive = true
    const key = `${merchantId}:${range}`
    listTransactions(merchantId, range)
      .then((rows) => alive && setTxnState({ key, rows, error: null }))
      .catch((e) => alive && setTxnState({ key, rows: null, error: e }))
    return () => {
      alive = false
    }
  }, [merchantId, range])

  const rangeLabel =
    RANGE_OPTIONS.find(
      (item) => item.value === range,
    )?.label || 'Last 14 Days'

  const impact = data?.impact
  const dash = data?.dash
  const k = dash?.kpis || {}
  const health = data?.health?.error ? null : data?.health
  const summaries = Array.isArray(data?.summaries) ? data.summaries : null
  const caveat = focus?.imp?.caveat || impact?.caveat

  const merchantsList = useMemo(() => impact?.merchants || [], [impact])
  const positiveCount = merchantsList.filter((m) => m.change_pct > 0).length
  const conversions = summaries ? summaries.reduce((s, x) => s + (x.performance?.conversions || 0), 0) : null

  // by_action rows (+ derived positive count / latest date from merchants[])
  const interventions = useMemo(
    () =>
      Object.entries(impact?.by_action || {})
        .map(([key, a]) => {
          const ms = merchantsList.filter((m) => m.action === key)
          return {
            key,
            label: a.label || ACTION_LABEL[key] || key,
            merchants: a.merchants,
            positive: ms.filter((m) => m.change_pct > 0).length,
            latest: ms.map((m) => m.intervention_date).sort().pop() || null,
            avg: a.avg_change_pct,
          }
        })
        .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity)),
    [impact, merchantsList],
  )

  const selectedInterventionData =
    interventions[
      selectedIntervention
    ]

  // Before / after series for the selected merchant
  const series = useMemo(() => focus?.imp?.series || [], [focus])
  const mImpact = focus?.imp?.impact
  const observed = series.map((p) => p.amount_inr)
  const baseline = mImpact?.baseline_avg_daily_inr != null ? series.map(() => mImpact.baseline_avg_daily_inr) : []
  const ivIndex = useMemo(() => {
    const i = series.findIndex((p) => p.phase === 'intervention')
    if (i >= 0) return i
    const j = series.findIndex((p) => p.phase === 'post')
    return j >= 0 ? j : null
  }, [series])
  const beforeAfterLabels = series.map((p, i) =>
    i === 0 || i === series.length - 1 || i === ivIndex ? fmtDay(p.date) : '',
  )
  const pointLabels = series.map((p) => `${fmtDay(p.date)} · ${p.phase}`)

  const trendValues = (txns || []).map((t) => t.amount_inr)
  const trendLabels = useMemo(() => {
    const rows = txns || []
    return rows.map((row, index) => {
      if (index === 0) return 'Start'
      if (index === rows.length - 1) return 'Current'
      if (rows.length <= 7) return fmtDay(row.txn_date)
      return ''
    })
  }, [txns])

  const merchant = focus?.detail?.merchant || {}
  const ivIssue = focus?.imp?.intervention?.issue || ACTION_LABEL[focus?.imp?.intervention?.action]
  const statusBadge = !focus
    ? 'Loading'
    : !focus.imp.intervention
      ? 'No intervention yet'
      : mImpact?.status === 'ok'
        ? 'Measured'
        : 'Not enough data yet'

  const best = interventions[0]
  const insight = impact
    ? best
      ? `${best.label} shows the highest average observed change (${fmtPct(best.avg)}) across ${best.merchants} merchant${best.merchants === 1 ? '' : 's'}; ${positiveCount} of ${impact.merchants_measured} measured merchants show a positive observed change.`
      : 'No merchant has a measurable intervention yet.'
    : null

  const opsKpis = [
    ['Visits today', k.visits_today, 'GET /dashboard', CheckCircle2],
    ['Visits (7d)', k.visits_7d, 'All reps', CheckCircle2],
    ['Compliance rate (7d)', k.compliance_rate_7d == null ? null : `${k.compliance_rate_7d}%`, 'Compliant of decided visits', Target],
    ['Avg authenticity (7d)', k.avg_authenticity_7d, 'Combined evidence signals', Target],
    ['Blocked visits (7d)', k.blocked_7d, 'Failed authenticity', BarChart3],
    ['Open escalations', k.open_escalations, 'Waiting for a manager', Clock3],
    ['Incentives (7d)', k.incentives_inr_7d == null ? null : fmtInr(k.incentives_inr_7d), '₹50 per verified compliant visit', CheckCircle2],
    ['WhatsApp sent (7d)', k.whatsapp_sent_7d, 'Merchant guidance messages', ArrowUpRight],
    ['Avg observed change', fmtPct(k.avg_observed_change_pct), 'Same as portfolio impact', TrendingUp],
    ['Avg QR score (7d)', k.avg_qr_score_7d, 'Vision audit, 0-100', BarChart3],
  ]

  const healthTiles = health
    ? [
        ['Vision provider', health.vision_provider, health.vision_provider === 'fixture' ? 'Fixture audits (demo)' : 'Live vision model'],
        ['Anthropic key', health.anthropic_key ? 'Present' : 'Not set', 'Needed for Claude vision'],
        ['Memory backend', health.memory, health.memory === 'cognee' ? 'Cognee graph, SQL fallback' : 'SQL merchant memory'],
        ['WhatsApp mode', health.whatsapp, health.whatsapp === 'twilio' ? 'Sent through Twilio' : 'Logged, not sent'],
        ['n8n', health.n8n ? 'Configured' : 'Off', health.n8n ? 'Pipeline runs through n8n' : 'Pipeline runs inline'],
        ['API status', health.status, 'GET /api/health'],
        ['Sarvam key', 'Not reported', '/api/health has no Sarvam field'],
        ['Dashboard generated', dash?.generated_at ? fmtDate(dash.generated_at) : '—', 'GET /dashboard'],
      ]
    : []

  if (!data) {
    return (
      <Layout crumb="Impact">
        <div className="analytics-page">
          <div className="analytics-loading">
            <div className="analytics-loading-orbit">
              <span />
              <span />
              <span />
            </div>

            <div>
              <span className="analytics-mini-label">
                OUTCOME INTELLIGENCE
              </span>

              <h2>
                {loadError ? 'Impact analytics unavailable' : 'Preparing impact intelligence'}
              </h2>

              <p>
                {loadError
                  ? errText(loadError)
                  : 'Loading intervention outcomes and transaction measurements.'}
              </p>

              {loadError && (
                <button
                  className="analytics-secondary-button"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setLoadError(null)
                    setReload((n) => n + 1)
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          </div>

          <AnalyticsStyles />
        </div>
      </Layout>
    )
  }

  return (
    <Layout crumb="Impact">
      <div className="analytics-page">

        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}

        <header className="analytics-header">
          <div>
            <div className="analytics-title-row">
              <div>
                <span className="analytics-mini-label">
                  OUTCOME INTELLIGENCE
                </span>

                <h1>
                  Impact analytics
                </h1>
              </div>

              <span className="analytics-live">
                <i />
                Live measurement
              </span>
            </div>

            <p>
              See what changed after every field
              intervention.
            </p>
          </div>

          <div className="analytics-controls">
            <div className="analytics-range">
              <button
                className="analytics-secondary-button"
                title="Window of the Transaction movement chart"
                onClick={() =>
                  setRangeOpen(
                    (value) =>
                      !value,
                  )
                }
              >
                <Clock3 size={15} />
                {rangeLabel}
                <ChevronDown
                  size={15}
                />
              </button>

              {rangeOpen && (
                <div className="analytics-range-menu">
                  {RANGE_OPTIONS.map(
                    (option) => (
                      <button
                        key={
                          option.value
                        }
                        className={
                          range ===
                          option.value
                            ? 'selected'
                            : ''
                        }
                        onClick={() => {
                          setRange(
                            option.value,
                          )
                          setRangeOpen(
                            false,
                          )
                          setTrendPoint(
                            null,
                          )
                        }}
                      >
                        {
                          option.label
                        }

                        {range ===
                          option.value && (
                          <CheckCircle2
                            size={14}
                          />
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            <button
              className="analytics-secondary-button"
              onClick={() =>
                setMethodologyOpen(
                  (value) =>
                    !value,
                )
              }
            >
              <Info size={15} />
              Methodology
            </button>
          </div>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Methodology                                                      */}
        {/* ---------------------------------------------------------------- */}

        {methodologyOpen && (
          <section className="analytics-methodology">
            <div className="analytics-methodology-icon">
              <Target size={18} />
            </div>

            <div>
              <span className="analytics-mini-label">
                MEASUREMENT FRAMEWORK
              </span>

              <h3>
                Observed change, not causal
                attribution.
              </h3>

              <p>
                SightPay compares a merchant&apos;s average
                daily transactions in the 14 days before a
                recorded intervention with up to 14 days
                after it (the intervention day itself is
                excluded). Either window needs at least 3
                days of data, otherwise the change is not
                reported. {caveat}
              </p>
            </div>

            <button
              className="analytics-icon-button"
              onClick={() =>
                setMethodologyOpen(
                  false,
                )
              }
            >
              <X size={16} />
            </button>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* KPIs                                                             */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-kpis">
          <ImpactKpi
            label="Positive observed change"
            value={`${positiveCount}`}
            detail={`Of ${impact.merchants_measured} measured merchants`}
            icon={CheckCircle2}
            active={
              selectedKpi ===
              'interventions'
            }
            onClick={() =>
              setSelectedKpi(
                'interventions',
              )
            }
          />

          <ImpactKpi
            label="Observed transaction change"
            value={fmtPct(impact.overall_avg_change_pct)}
            detail="Avg across measured merchants"
            icon={TrendingUp}
            active={
              selectedKpi === 'change'
            }
            onClick={() =>
              setSelectedKpi(
                'change',
              )
            }
          />

          <ImpactKpi
            label="Avg QR visibility (7d)"
            value={k.avg_qr_score_7d}
            detail="Vision audit score, 0-100"
            icon={BarChart3}
            active={
              selectedKpi ===
              'visibility'
            }
            onClick={() =>
              setSelectedKpi(
                'visibility',
              )
            }
          />

          <ImpactKpi
            label="Merchants recovered"
            value={conversions}
            detail="Non-compliant → compliant (30d)"
            icon={Target}
            active={
              selectedKpi ===
              'recovered'
            }
            onClick={() =>
              setSelectedKpi(
                'recovered',
              )
            }
          />

          <ImpactKpi
            label="Merchants measured"
            value={impact.merchants_measured}
            detail="With a measurable intervention"
            icon={CheckCircle2}
            active={
              selectedKpi ===
              'measured'
            }
            onClick={() =>
              setSelectedKpi(
                'measured',
              )
            }
          />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Hero outcome chart                                                */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-outcome-card">
          <div className="analytics-section-head">
            <div>
              <span className="analytics-mini-label">
                WHAT CHANGED
              </span>

              <h2>
                Before vs after intervention
              </h2>

              <p>
                {safeValue(
                  merchant.name,
                )}
                {merchant.name &&
                  ' · '}
                transaction value per day (₹)
              </p>
            </div>

            <div className="analytics-legend">
              <span>
                <i className="baseline" />
                Baseline avg
              </span>

              <span>
                <i className="observed" />
                Observed
              </span>
            </div>
          </div>

          <div className="analytics-outcome-summary">
            <div>
              <span>Baseline</span>
              <strong>
                {mImpact?.baseline_avg_daily_inr != null
                  ? `${fmtInr(mImpact.baseline_avg_daily_inr)}/day`
                  : '—'}
              </strong>
            </div>

            <ArrowRight />

            <div>
              <span>Intervention</span>
              <strong>
                {safeValue(ivIssue)}
                {focus?.imp?.intervention?.date ? ` · ${fmtDate(focus.imp.intervention.date)}` : ''}
              </strong>
            </div>

            <ArrowRight />

            <div className="analytics-summary-positive">
              <span>Observed</span>

              <strong>
                {mImpact?.post_avg_daily_inr != null
                  ? `${fmtInr(mImpact.post_avg_daily_inr)}/day`
                  : mImpact
                    ? `Not enough data yet (${mImpact.post_days} days after)`
                    : '—'}
              </strong>

              <b>
                {fmtPct(mImpact?.change_pct)}
              </b>
            </div>
          </div>

          <ImpactChart
            values={[
              baseline,
              observed,
            ]}
            beforeAfter
            interventionIndex={ivIndex}
            labels={
              series.length ? beforeAfterLabels : []
            }
            selectedPoint={
              selectedPoint
            }
            onSelectPoint={
              (i) => setSelectedPoint(i)
            }
            formatValue={(v) => fmtInr(v)}
            emptyText={
              focusError
                ? `Could not load this merchant's impact: ${errText(focusError)}`
                : !merchantId
                  ? 'No merchant has a measurable intervention yet.'
                  : !focus
                    ? 'Loading measurement…'
                    : 'No guidance sent to this merchant yet.'
            }
          />

          {selectedPoint !== null && series[selectedPoint] && (
            <div className="analytics-chart-note">
              <Info size={13} />
              {pointLabels[selectedPoint]}: {fmtInr(series[selectedPoint].amount_inr)} ·{' '}
              {series[selectedPoint].txn_count} transactions
            </div>
          )}

          {focus?.imp?.newer_intervention_pending && (
            <div className="analytics-chart-note">
              <Clock3 size={13} />
              New guidance sent {fmtDate(focus.imp.newer_intervention_pending.date)} (
              {focus.imp.newer_intervention_pending.issue}), still collecting data.
            </div>
          )}

          <div className="analytics-chart-note" data-testid="impact-caveat">
            <Info size={13} />
            {caveat}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Merchant outcome                                                  */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-merchant-card">
          <div className="analytics-merchant-heading">
            <div>
              <span className="analytics-mini-label">
                MERCHANT OUTCOME
              </span>

              <h2>
                {merchant.id ? (
                  <Link to={`/merchants/${merchant.id}`} style={{ color: 'inherit' }}>
                    {merchant.name}
                  </Link>
                ) : (
                  safeValue(merchant.name)
                )}
              </h2>

              <p>
                {safeValue(
                  merchant.address,
                )}
                {merchant.address &&
                  ' · '}
                {safeValue(
                  ivIssue,
                )}
              </p>
            </div>

            <span className="analytics-measured-badge">
              <CheckCircle2
                size={14}
              />
              {statusBadge}
            </span>
          </div>

          <div className="analytics-merchant-grid">
            <div>
              <span>
                QR visibility
              </span>

              <strong>
                {safeValue(
                  focus?.beforeVisit?.qr_visibility_score,
                )}

                <ArrowRight
                  size={14}
                />

                {safeValue(
                  focus?.afterVisit?.qr_visibility_score,
                )}
              </strong>

              <small>
                {focus?.afterVisit
                  ? signedPts(focus?.beforeVisit?.qr_visibility_score, focus.afterVisit.qr_visibility_score)
                  : 'No visit since the intervention'}
              </small>
            </div>

            <div>
              <span>
                Transactions
              </span>

              <strong>
                {safeValue(
                  mImpact?.baseline_avg_txn_count,
                )}

                <ArrowRight
                  size={14}
                />

                {safeValue(
                  mImpact?.post_avg_txn_count,
                )}
              </strong>

              <small>
                Observed movement (avg per day)
              </small>
            </div>

            <div>
              <span>
                Competitor risk
              </span>

              <strong>
                {safeValue(
                  focus?.auditBefore?.competitor_dominance,
                )}

                <ArrowRight
                  size={14}
                />

                {safeValue(
                  focus?.auditAfter?.competitor_dominance,
                )}
              </strong>

              <small>
                {focus?.auditAfter?.competitor || focus?.auditBefore?.competitor
                  ? `${focus?.auditAfter?.competitor || focus?.auditBefore?.competitor} dominance, latest audit`
                  : 'Current assessment'}
              </small>
            </div>

            <div>
              <span>
                Intervention
              </span>

              <strong className="text-value">
                {safeValue(
                  ivIssue,
                )}
              </strong>

              <small>
                {focus?.imp?.intervention?.date
                  ? `Guidance sent ${fmtDate(focus.imp.intervention.date)}`
                  : 'Completed action'}
              </small>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Intervention performance                                          */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-section-card">
          <div className="analytics-section-head">
            <div>
              <span className="analytics-mini-label">
                FIELD INTERVENTIONS
              </span>

              <h2>
                Intervention performance
              </h2>

              <p>
                Compare measured outcomes across
                intervention types.
              </p>
            </div>

            <div className="analytics-table-count">
              <Filter size={14} />
              {interventions.length}{' '}
              intervention types
            </div>
          </div>

          <InterventionTable
            rows={interventions}
            selected={
              selectedIntervention
            }
            onSelect={
              setSelectedIntervention
            }
          />

          {selectedInterventionData && (
            <div className="analytics-selected-intervention">
              <div className="analytics-selected-icon">
                <TrendingUp size={17} />
              </div>

              <div>
                <span className="analytics-mini-label">
                  SELECTED INTERVENTION
                </span>

                <h3>
                  {safeValue(
                    selectedInterventionData.label,
                  )}
                </h3>

                <p>
                  {selectedInterventionData.merchants}{' '}
                  merchants measured,{' '}
                  {selectedInterventionData.positive}{' '}
                  with a positive observed change.
                </p>
              </div>

              <div className="analytics-selected-result">
                <span>
                  OBSERVED CHANGE
                </span>

                <strong>
                  {fmtPct(
                    selectedInterventionData.avg,
                  )}
                </strong>
              </div>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Per-merchant observed change                                      */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-section-card">
          <div className="analytics-section-head">
            <div>
              <span className="analytics-mini-label">
                MERCHANT OUTCOMES
              </span>

              <h2>
                Observed change by merchant
              </h2>

              <p>
                Each merchant&apos;s most recent measurable
                intervention. Select a row to chart it.
              </p>
            </div>

            <div className="analytics-table-count">
              <Filter size={14} />
              {merchantsList.length} merchants
            </div>
          </div>

          {!merchantsList.length ? (
            <div className="analytics-empty">
              <BarChart3 size={20} />
              <span>No merchant has a measurable intervention yet.</span>
            </div>
          ) : (
            <div className="analytics-table">
              <div className="analytics-table-head">
                <span>MERCHANT</span>
                <span>INTERVENTION</span>
                <span>DATE</span>
                <span>OBSERVED CHANGE</span>
                <span>MERCHANT 360</span>
              </div>

              {merchantsList.map((row) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={row.merchant_id}
                  className={`analytics-table-row ${merchantId === row.merchant_id ? 'selected' : ''}`}
                  onClick={() => selectMerchant(row.merchant_id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && selectMerchant(row.merchant_id)}
                >
                  <span className="analytics-intervention-name">
                    <i />
                    {row.merchant_name}
                  </span>
                  <span>{ACTION_LABEL[row.action] || row.action}</span>
                  <span>{fmtDate(row.intervention_date)}</span>
                  <span className={row.change_pct > 0 ? 'analytics-positive' : ''}>
                    {row.change_pct > 0 && <ArrowUpRight size={14} />}
                    {fmtPct(row.change_pct)}
                  </span>
                  <span>
                    <Link
                      to={`/merchants/${row.merchant_id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#1F5BFF', fontWeight: 600 }}
                    >
                      Open #{row.merchant_id} →
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="analytics-chart-note">
            <Info size={13} />
            {impact.caveat}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Trend                                                             */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-section-card">
          <div className="analytics-section-head">
            <div>
              <span className="analytics-mini-label">
                FIELD SIGNAL
              </span>

              <h2>
                Transaction movement
              </h2>

              <p>
                Daily transaction value for{' '}
                {safeValue(merchant.name)} ·{' '}
                {rangeLabel.toLowerCase()}.
              </p>
            </div>

            <span className="analytics-trend-badge">
              <TrendingUp size={13} />
              Observational trend
            </span>
          </div>

          <ImpactChart
            values={trendValues}
            labels={trendLabels}
            selectedPoint={
              trendPoint
            }
            onSelectPoint={
              setTrendPoint
            }
            formatValue={(v) => fmtInr(v)}
            emptyText={
              txnError
                ? `Could not load transactions: ${errText(txnError)}`
                : !merchantId
                  ? 'Select a merchant to see its transactions.'
                  : txns
                    ? 'No transactions in this window.'
                    : 'Loading transactions…'
            }
          />

          <div className="analytics-trend-footer">
            <div>
              <span>
                Current observed change
              </span>
              <strong>
                {fmtPct(mImpact?.change_pct)}
              </strong>
            </div>

            <div>
              <span>
                Merchants measured
              </span>
              <strong>
                {safeValue(
                  impact.merchants_measured,
                )}
              </strong>
            </div>

            <button
              onClick={() =>
                setPendingOpen(true)
              }
            >
              View pending measurement
              <ArrowRight size={14} />
            </button>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* AI insight                                                        */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-ai-card">
          <div className="analytics-ai-mark">
            <span>AI</span>
          </div>

          <div>
            <span className="analytics-mini-label">
              SIGHTPAY INTELLIGENCE
            </span>

            <h2>
              {safeValue(
                insight,
              )}
            </h2>

            <p>
              {impact.caveat}
            </p>
          </div>

          <button
            className="analytics-secondary-button"
            onClick={() =>
              setPendingOpen(true)
            }
          >
            Measurement queue
            <ArrowRight size={15} />
          </button>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Field operations (GET /dashboard)                                 */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-section-card">
          <div className="analytics-section-head">
            <div>
              <span className="analytics-mini-label">
                FIELD OPERATIONS
              </span>

              <h2>
                Operations dashboard
              </h2>

              <p>
                Today and the last 7 days, all reps.
              </p>
            </div>

            <div className="analytics-table-count">
              <Filter size={14} />
              {Object.entries(dash?.decision_breakdown_7d || {})
                .map(([d, n]) => `${DECISION_LABEL[d] || d}: ${n}`)
                .join(' · ') || 'No decisions in 7 days'}
            </div>
          </div>

          <div className="analytics-kpis">
            {opsKpis.map(([label, value, detail, Icon]) => (
              <ImpactKpi key={label} label={label} value={value} detail={detail} icon={Icon} />
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* System / provider health (GET /health)                            */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-merchant-card">
          <div className="analytics-merchant-heading">
            <div>
              <span className="analytics-mini-label">
                SYSTEM HEALTH
              </span>

              <h2>
                Providers and pipeline
              </h2>

              <p>
                Configured state from GET /api/health (not uptime).
              </p>
            </div>

            <span className="analytics-measured-badge">
              <CheckCircle2 size={14} />
              {health ? `API ${health.status}` : data?.health?.error ? 'Unavailable' : '—'}
            </span>
          </div>

          {data?.health?.error ? (
            <div className="analytics-empty">
              <Info size={20} />
              <span>Could not load /api/health: {errText(data.health.error)}</span>
            </div>
          ) : (
            <div className="analytics-merchant-grid">
              {healthTiles.map(([label, value, detail]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className="text-value">{safeValue(value)}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Closed loop                                                       */}
        {/* ---------------------------------------------------------------- */}

        <section className="analytics-loop">
          <div className="analytics-loop-heading">
            <span className="analytics-mini-label">
              SIGHTPAY CLOSED LOOP
            </span>

            <h2>
              Every visit improves the next
              decision.
            </h2>

            <p>
              Field evidence becomes outcome data,
              and outcome data becomes context for
              the next best visit.
            </p>
          </div>

          <div className="analytics-loop-flow">
            {[
              ['01', 'Visit'],
              ['02', 'Evidence'],
              ['03', 'Decision'],
              ['04', 'Intervention'],
              ['05', 'Outcome'],
              ['06', 'Memory'],
              ['07', 'Next best visit'],
            ].map(
              ([number, title], index) => (
                <div
                  className={`analytics-loop-node ${
                    index === 6
                      ? 'final'
                      : ''
                  }`}
                  key={title}
                >
                  <span>
                    {number}
                  </span>

                  <strong>
                    {title}
                  </strong>

                  {index < 6 && (
                    <ArrowRight size={14} />
                  )}
                </div>
              ),
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Pending drawer                                                    */}
        {/* ---------------------------------------------------------------- */}

        <PendingDrawer
          open={pendingOpen}
          onClose={() =>
            setPendingOpen(false)
          }
        />
      </div>

      <AnalyticsStyles />
    </Layout>
  )
}

/* -------------------------------------------------------------------------- */
/* Scoped visual system                                                       */
/* -------------------------------------------------------------------------- */

function AnalyticsStyles() {
  return (
    <style>{`
      .analytics-page {
        min-height: 100%;
        padding: 30px 34px 70px;
        color: #0A1B3D;
        background:
          radial-gradient(
            circle at 85% 0%,
            rgba(156,192,255,.20),
            transparent 30%
          ),
          #F4F7FF;
      }

      .analytics-page * {
        box-sizing: border-box;
      }

      .analytics-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 28px;
        margin-bottom: 24px;
      }

      .analytics-title-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .analytics-title-row h1 {
        margin: 5px 0 0;
        font-size: clamp(32px, 3vw, 48px);
        line-height: 1;
        letter-spacing: -.045em;
        font-weight: 700;
        color: #F5F7F4;
      }

      .analytics-header p {
        margin: 12px 0 0;
        color: #929A94;
        font-size: 15px;
      }

      .analytics-mini-label {
        display: block;
        color: #B7FF3C;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .11em;
      }

      .analytics-live,
      .analytics-measured-badge,
      .analytics-trend-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px solid rgba(183,255,60,0.2);
        background: #111515;
        color: #B7FF3C;
        padding: 8px 11px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
      }

      .analytics-live i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #B7FF3C;
        box-shadow: 0 0 8px #B7FF3C;
      }

      .analytics-controls {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .analytics-secondary-button,
      .analytics-primary-button {
        border: 1px solid #DDE7FB;
        background: #EEF3FF;
        color: #1F5BFF;
        min-height: 42px;
        padding: 0 15px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        transition: .2s ease;
      }

      .analytics-secondary-button:hover {
        border-color: #1F5BFF;
        color: #0B2A8A;
        background: #E3EDFF;
        transform: translateY(-1px);
      }

      .analytics-primary-button {
        width: 100%;
        border: 0;
        color: #FFFFFF;
        font-weight: 700;
        background: #1F5BFF;
      }

      .analytics-range {
        position: relative;
      }

      .analytics-range-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        width: 175px;
        padding: 6px;
        border: 1px solid #DDE7FB;
        border-radius: 15px;
        background: #FFFFFF;
        box-shadow: 0 14px 36px -20px rgba(10,27,61,0.12);
        z-index: 30;
      }

      .analytics-range-menu button {
        width: 100%;
        border: 0;
        background: transparent;
        padding: 10px 11px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        color: #5B6E96;
        font: inherit;
        font-size: 12px;
      }

      .analytics-range-menu button:hover,
      .analytics-range-menu button.selected {
        background: #F8FAFF;
        color: #1F5BFF;
      }

      .analytics-methodology {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 16px;
        align-items: start;
        padding: 18px;
        margin-bottom: 18px;
        border: 1px solid #DDE7FB;
        border-radius: 20px;
        background: rgba(255,255,255,.84);
      }

      .analytics-methodology-icon,
      .analytics-selected-icon {
        width: 40px;
        height: 40px;
        border-radius: 13px;
        display: grid;
        place-items: center;
        background: #EEF3FF;
        color: #1F5BFF;
      }

      .analytics-methodology h3 {
        margin: 4px 0 6px;
        font-size: 17px;
        letter-spacing: -.02em;
      }

      .analytics-methodology p {
        max-width: 850px;
        margin: 0;
        color: #5B6E96;
        font-size: 13px;
        line-height: 1.6;
      }

      .analytics-icon-button {
        width: 34px;
        height: 34px;
        border: 1px solid #DDE7FB;
        background: white;
        color: #5B6E96;
        border-radius: 50%;
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .analytics-kpis {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 12px;
        margin-bottom: 18px;
      }

      .analytics-kpi {
        position: relative;
        min-height: 145px;
        padding: 17px;
        border: 1px solid #DDE7FB;
        border-radius: 22px;
        background: rgba(255,255,255,.88);
        text-align: left;
        color: #0A1B3D;
        cursor: pointer;
        overflow: hidden;
        transition: .22s ease;
      }

      .analytics-kpi::after {
        content: "";
        position: absolute;
        left: 17px;
        right: 17px;
        bottom: 0;
        height: 3px;
        border-radius: 3px 3px 0 0;
        background: #DDE7FB;
      }

      .analytics-kpi:hover,
      .analytics-kpi.active {
        border-color: #9CC0FF;
        transform: translateY(-2px);
        box-shadow: 0 16px 40px rgba(31,91,255,.08);
      }

      .analytics-kpi.active::after {
        background: #1F5BFF;
      }

      .analytics-kpi-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        color: #5B6E96;
        font-size: 11px;
        line-height: 1.35;
      }

      .analytics-kpi-icon {
        width: 32px;
        height: 32px;
        border-radius: 11px;
        display: grid;
        place-items: center;
        background: #EEF3FF;
        color: #1F5BFF;
        flex: 0 0 auto;
      }

      .analytics-kpi strong {
        display: block;
        margin-top: 17px;
        font-size: 29px;
        letter-spacing: -.045em;
      }

      .analytics-kpi small {
        display: block;
        margin-top: 5px;
        color: #8090AF;
        font-size: 11px;
      }

      .analytics-outcome-card,
      .analytics-section-card,
      .analytics-merchant-card {
        border: 1px solid #DDE7FB;
        border-radius: 28px;
        background: rgba(255,255,255,.90);
        box-shadow: 0 20px 55px rgba(21,55,120,.055);
      }

      .analytics-outcome-card {
        padding: 25px;
        margin-bottom: 18px;
      }

      .analytics-section-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
        margin-bottom: 18px;
      }

      .analytics-section-head h2,
      .analytics-merchant-heading h2,
      .analytics-ai-card h2,
      .analytics-loop-heading h2 {
        margin: 5px 0 5px;
        font-size: 24px;
        line-height: 1.1;
        letter-spacing: -.035em;
        font-weight: 600;
      }

      .analytics-section-head p,
      .analytics-merchant-heading p {
        margin: 0;
        color: #7182A3;
        font-size: 12px;
      }

      .analytics-legend {
        display: flex;
        gap: 15px;
        color: #7182A3;
        font-size: 11px;
      }

      .analytics-legend span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .analytics-legend i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .analytics-legend .baseline {
        background: #AEBBD2;
      }

      .analytics-legend .observed {
        background: #1F5BFF;
      }

      .analytics-outcome-summary {
        display: flex;
        align-items: center;
        gap: 22px;
        padding: 14px 17px;
        margin-bottom: 14px;
        border-radius: 17px;
        background: #F4F7FF;
      }

      .analytics-outcome-summary > div {
        min-width: 115px;
      }

      .analytics-outcome-summary span {
        display: block;
        color: #7182A3;
        font-size: 10px;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: .06em;
      }

      .analytics-outcome-summary strong {
        display: block;
        margin-top: 4px;
        font-size: 15px;
      }

      .analytics-outcome-summary svg {
        color: #9AA9C4;
        flex: 0 0 auto;
      }

      .analytics-summary-positive strong {
        color: #1F5BFF;
      }

      .analytics-summary-positive b {
        display: inline-block;
        margin-left: 7px;
        color: #1F5BFF;
        font-size: 12px;
      }

      .analytics-chart {
        width: 100%;
        overflow: hidden;
      }

      .analytics-chart svg {
        width: 100%;
        height: 285px;
        display: block;
      }

      .analytics-grid-line {
        stroke: #E8EEF9;
        stroke-width: 1;
      }

      .analytics-axis-label {
        fill: #9AA9C4;
        font-size: 9px;
      }

      .analytics-baseline {
        fill: none;
        stroke: #AEBBD2;
        stroke-width: 2.5;
        stroke-dasharray: 6 5;
      }

      .analytics-observed-line {
        fill: none;
        stroke: #1F5BFF;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .analytics-intervention-line {
        stroke: #1F5BFF;
        stroke-width: 1;
        stroke-dasharray: 4 4;
        opacity: .65;
      }

      .analytics-intervention-bg {
        fill: #EEF3FF;
        stroke: #DDE7FB;
      }

      .analytics-intervention-label {
        fill: #1F5BFF;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: .06em;
      }

      .analytics-point {
        cursor: pointer;
      }

      .analytics-point-dot {
        fill: #1F5BFF;
        stroke: white;
        stroke-width: 2;
      }

      .analytics-point-hit {
        fill: transparent;
      }

      .analytics-tooltip {
        fill: #0B2A8A;
      }

      .analytics-tooltip-label {
        fill: #BFD4FF;
        font-size: 8px;
      }

      .analytics-tooltip-value {
        fill: white;
        font-size: 9px;
        font-weight: 650;
      }

      .analytics-chart-labels {
        display: flex;
        justify-content: space-between;
        margin: -3px 4px 0;
      }

      .analytics-chart-labels button {
        border: 0;
        background: transparent;
        color: #9AA9C4;
        cursor: pointer;
        font: inherit;
        font-size: 10px;
      }

      .analytics-chart-labels button.active {
        color: #1F5BFF;
        font-weight: 700;
      }

      .analytics-chart-note {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        color: #8190AD;
        font-size: 10px;
        margin-top: 8px;
      }

      .analytics-merchant-card {
        padding: 24px;
        margin-bottom: 18px;
      }

      .analytics-merchant-heading {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
        margin-bottom: 22px;
      }

      .analytics-merchant-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        border-top: 1px solid #E8EEF9;
      }

      .analytics-merchant-grid > div {
        padding: 19px 16px 5px;
        border-right: 1px solid #E8EEF9;
      }

      .analytics-merchant-grid > div:first-child {
        padding-left: 0;
      }

      .analytics-merchant-grid > div:last-child {
        border-right: 0;
        padding-right: 0;
      }

      .analytics-merchant-grid span {
        display: block;
        color: #7182A3;
        font-size: 11px;
      }

      .analytics-merchant-grid strong {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        font-size: 15px;
      }

      .analytics-merchant-grid strong svg {
        color: #9AA9C4;
      }

      .analytics-merchant-grid small {
        display: block;
        margin-top: 5px;
        color: #1F5BFF;
        font-size: 10px;
      }

      .analytics-merchant-grid .text-value {
        display: block;
        max-width: 170px;
        line-height: 1.35;
      }

      .analytics-section-card {
        padding: 24px;
        margin-bottom: 18px;
      }

      .analytics-table-count {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 11px;
        border-radius: 999px;
        background: #F4F7FF;
        color: #5B6E96;
        font-size: 10px;
      }

      .analytics-table {
        overflow: hidden;
        border: 1px solid #E3EAF7;
        border-radius: 16px;
      }

      .analytics-table-head,
      .analytics-table-row {
        display: grid;
        grid-template-columns: 2fr .8fr .9fr .9fr 1fr;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }

      .analytics-table-head {
        background: #F4F7FF;
        color: #8190AD;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .06em;
      }

      .analytics-table-row {
        width: 100%;
        border: 0;
        border-top: 1px solid #E8EEF9;
        background: white;
        text-align: left;
        color: #0A1B3D;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
      }

      .analytics-table-row:hover,
      .analytics-table-row.selected {
        background: #F8FAFF;
      }

      .analytics-intervention-name {
        display: flex;
        align-items: center;
        gap: 9px;
        font-weight: 650;
      }

      .analytics-intervention-name i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #9CC0FF;
      }

      .analytics-table-row.selected
      .analytics-intervention-name i {
        background: #1F5BFF;
        box-shadow: 0 0 0 4px rgba(31,91,255,.10);
      }

      .analytics-positive {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        color: #1F5BFF;
        font-weight: 700;
      }

      .analytics-selected-intervention {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 13px;
        margin-top: 15px;
        padding: 15px;
        border-radius: 17px;
        background: #F4F7FF;
      }

      .analytics-selected-intervention h3 {
        margin: 3px 0;
        font-size: 15px;
      }

      .analytics-selected-intervention p {
        margin: 0;
        color: #7182A3;
        font-size: 11px;
      }

      .analytics-selected-result {
        text-align: right;
      }

      .analytics-selected-result span {
        display: block;
        color: #8190AD;
        font-size: 9px;
        font-weight: 700;
      }

      .analytics-selected-result strong {
        display: block;
        margin-top: 3px;
        color: #1F5BFF;
        font-size: 22px;
      }

      .analytics-trend-footer {
        display: flex;
        align-items: center;
        gap: 38px;
        padding-top: 15px;
        margin-top: 5px;
        border-top: 1px solid #E8EEF9;
      }

      .analytics-trend-footer div span {
        display: block;
        color: #8190AD;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .05em;
      }

      .analytics-trend-footer div strong {
        display: block;
        margin-top: 4px;
        font-size: 17px;
      }

      .analytics-trend-footer button {
        margin-left: auto;
        border: 0;
        background: transparent;
        color: #1F5BFF;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font: inherit;
        font-size: 11px;
        font-weight: 650;
      }

      .analytics-ai-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 17px;
        padding: 22px;
        margin-bottom: 28px;
        border: 1px solid #CFE0FF;
        border-radius: 25px;
        background:
          radial-gradient(
            circle at 90% 10%,
            rgba(156,192,255,.30),
            transparent 35%
          ),
          #EEF3FF;
      }

      .analytics-ai-mark {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background: linear-gradient(
          135deg,
          #1F5BFF,
          #0B2A8A
        );
        color: white;
        box-shadow: 0 10px 25px rgba(31,91,255,.20);
      }

      .analytics-ai-mark span {
        font-size: 11px;
        font-weight: 800;
      }

      .analytics-ai-card h2 {
        max-width: 800px;
        font-size: 17px;
        line-height: 1.35;
      }

      .analytics-ai-card p {
        margin: 5px 0 0;
        color: #5B6E96;
        font-size: 11px;
      }

      .analytics-loop {
        padding: 12px 2px 35px;
      }

      .analytics-loop-heading {
        max-width: 650px;
        margin-bottom: 20px;
      }

      .analytics-loop-heading h2 {
        font-size: 28px;
      }

      .analytics-loop-heading p {
        margin: 8px 0 0;
        color: #5B6E96;
        font-size: 13px;
        line-height: 1.5;
      }

      .analytics-loop-flow {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 8px;
      }

      .analytics-loop-node {
        min-height: 80px;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 12px;
        border: 1px solid #DDE7FB;
        border-radius: 16px;
        background: rgba(255,255,255,.75);
      }

      .analytics-loop-node > span {
        color: #9AA9C4;
        font-size: 9px;
        font-weight: 700;
      }

      .analytics-loop-node strong {
        font-size: 11px;
      }

      .analytics-loop-node svg {
        position: absolute;
        right: -13px;
        top: 31px;
        color: #9AA9C4;
        z-index: 2;
      }

      .analytics-loop-node.final {
        background: #0B2A8A;
        border-color: #0B2A8A;
        color: white;
        box-shadow: 0 15px 30px rgba(11,42,138,.16);
      }

      .analytics-loop-node.final > span {
        color: #9CC0FF;
      }

      .analytics-empty,
      .analytics-empty-chart {
        min-height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #8190AD;
        font-size: 12px;
      }

      .analytics-loading {
        min-height: 65vh;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 18px;
      }

      .analytics-loading h2 {
        margin: 5px 0;
        font-size: 22px;
      }

      .analytics-loading p {
        margin: 0;
        color: #7182A3;
        font-size: 12px;
      }

      .analytics-loading-orbit {
        position: relative;
        width: 52px;
        height: 52px;
        border: 1px solid #CFE0FF;
        border-radius: 50%;
      }

      .analytics-loading-orbit span {
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #1F5BFF;
      }

      .analytics-loading-orbit span:nth-child(1) {
        top: 5px;
        left: 22px;
      }

      .analytics-loading-orbit span:nth-child(2) {
        right: 5px;
        bottom: 13px;
      }

      .analytics-loading-orbit span:nth-child(3) {
        left: 7px;
        bottom: 13px;
      }

      .analytics-drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(10,27,61,.22);
        backdrop-filter: blur(3px);
        z-index: 100;
      }

      .analytics-drawer {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: min(430px, 94vw);
        padding: 27px;
        background: white;
        border-left: 1px solid #DDE7FB;
        box-shadow: -25px 0 70px rgba(10,27,61,.15);
        z-index: 101;
      }

      .analytics-drawer-head {
        display: flex;
        justify-content: space-between;
        gap: 20px;
      }

      .analytics-drawer h2 {
        margin: 5px 0;
        font-size: 26px;
        letter-spacing: -.035em;
      }

      .analytics-drawer p {
        margin: 0;
        color: #7182A3;
        font-size: 12px;
        line-height: 1.5;
      }

      .analytics-pending-list {
        display: grid;
        gap: 10px;
        margin: 28px 0;
      }

      .analytics-pending-item {
        display: flex;
        gap: 12px;
        padding: 15px;
        border: 1px solid #DDE7FB;
        border-radius: 16px;
        background: #F8FAFF;
      }

      .analytics-pending-icon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: #EEF3FF;
        color: #1F5BFF;
        flex: 0 0 auto;
      }

      .analytics-pending-item strong {
        display: block;
        font-size: 12px;
      }

      .analytics-pending-item span {
        display: block;
        margin-top: 4px;
        color: #7182A3;
        font-size: 10px;
        line-height: 1.45;
      }

      @media (max-width: 1100px) {
        .analytics-kpis {
          grid-template-columns: repeat(3, 1fr);
        }

        .analytics-loop-flow {
          grid-template-columns: repeat(4, 1fr);
        }

        .analytics-merchant-grid {
          grid-template-columns: repeat(2, 1fr);
        }

        .analytics-merchant-grid > div:nth-child(2) {
          border-right: 0;
        }
      }

      @media (max-width: 760px) {
        .analytics-page {
          padding: 20px 16px 50px;
        }

        .analytics-header,
        .analytics-section-head,
        .analytics-merchant-heading {
          flex-direction: column;
          align-items: flex-start;
        }

        .analytics-controls {
          width: 100%;
        }

        .analytics-controls > *,
        .analytics-range,
        .analytics-range button {
          flex: 1;
        }

        .analytics-kpis {
          grid-template-columns: repeat(2, 1fr);
        }

        .analytics-outcome-summary {
          overflow-x: auto;
        }

        .analytics-merchant-grid {
          grid-template-columns: 1fr;
        }

        .analytics-merchant-grid > div {
          border-right: 0;
          border-bottom: 1px solid #E8EEF9;
          padding-left: 0;
          padding-right: 0;
        }

        .analytics-table {
          overflow-x: auto;
        }

        .analytics-table-head,
        .analytics-table-row {
          min-width: 680px;
        }

        .analytics-ai-card {
          grid-template-columns: auto 1fr;
        }

        .analytics-ai-card > button {
          grid-column: 1 / -1;
        }

        .analytics-loop-flow {
          grid-template-columns: repeat(2, 1fr);
        }

        .analytics-loop-node svg {
          display: none;
        }

        .analytics-selected-intervention {
          grid-template-columns: auto 1fr;
        }

        .analytics-selected-result {
          grid-column: 2;
          text-align: left;
        }
      }
    `}</style>
  )
}