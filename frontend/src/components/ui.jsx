import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, CircleCheck, Clock, ShieldCheck, ChevronRight, AlertTriangle } from 'lucide-react'

/* Light Glossy Fintech palette */
const BLUE = '#1F5BFF'
const NAVY = '#0B2A8A'
const LIGHT_SURFACE = '#FFFFFF'
const MUTED_TEXT = '#5B6E96'
const SERIES = [BLUE, '#00B887', '#FF9F00', '#7C3AED']

export const Logo = ({ size = 26 }) => (
  <Link to="/" className="logo" aria-label="SightPay home">
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={BLUE} />
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="2.2" fill="#FFFFFF" />
      <path d="M16 3.5v4M16 24.5v4M3.5 16h4M24.5 16h4" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
    <span style={{ color: '#0A1B3D', fontWeight: 700 }}>Sight<span style={{ color: BLUE }}>Pay</span></span>
  </Link>
)

export const PriorityBadge = ({ level }) => <span className={`pill ${level}`}>{level}</span>

export const Trend = ({ v }) => (
  <span className={`trend ${v < 0 ? 'dn' : 'up'}`}>
    {v < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
    {v < 0 ? '↓' : '+'}
    {Math.abs(v)}%
  </span>
)

export const StatCard = ({ label, value, note, up, i = 0 }) => (
  <div className="card stat" style={{ '--i': i }}>
    <div className="mu sm">{label}</div>
    <div className="kpi">{value}</div>
    <div className={`sm ${up ? 'lime' : 'amb'}`}>
      {up ? <TrendingUp size={13} /> : <AlertTriangle size={13} />} {note}
    </div>
  </div>
)

export const ScoreRing = ({ value, size = 84 }) => {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="rb" />
        <circle
          cx="40" cy="40" r={r} className="rf" strokeDasharray={c}
          style={{ '--c': c, '--o': c * (1 - value / 100) }} transform="rotate(-90 40 40)"
        />
      </svg>
      <div><b>{value}</b><span>/100</span></div>
    </div>
  )
}

export const VisitStatus = ({ s }) =>
  s === 'ok' ? (
    <span className="dot ok"><CircleCheck size={14} /></span>
  ) : (
    <span className="dot wait"><Clock size={14} /></span>
  )

export const EvidenceIndicator = ({ label = 'GPS verified' }) => (
  <span className="pill ev"><ShieldCheck size={12} /> {label}</span>
)

export const WorkspaceCard = ({ icon: Icon, tag, title, text, cta, active, onSelect, onGo }) => (
  <div
    className={`ws ${active ? 'on' : ''}`}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onSelect()}
  >
    <div className="wsi"><Icon size={20} strokeWidth={1.6} /></div>
    <div className="grow">
      <div className="mu sm">{tag}</div>
      <h3>{title}</h3>
      <p className="mu">{text}</p>
    </div>
    <button
      className={`btn ${active ? 'p' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onGo()
      }}
    >
      {cta} <ChevronRight size={16} />
    </button>
  </div>
)

export const MapView = ({ points, done, total, priority }) => {
  const col = { done: '#059669', pending: BLUE, high: '#DC2626' }
  return (
    <div className="map">
      <svg viewBox="0 0 100 60" preserveAspectRatio="none">
        {[...Array(9)].map((_, i) => <line key={'h' + i} x1="0" x2="100" y1={i * 7.5} y2={i * 7.5} className="gl" stroke="rgba(31, 91, 255, 0.08)" />)}
        {[...Array(15)].map((_, i) => <line key={'v' + i} y1="0" y2="60" x1={i * 7.2} x2={i * 7.2} className="gl" stroke="rgba(31, 91, 255, 0.08)" />)}
        <path d="M0 40 C20 30 30 46 50 34 S80 20 100 28" className="road" stroke="rgba(31, 91, 255, 0.3)" fill="none" />
        <path d="M20 0 C28 20 40 30 44 60" className="road" stroke="rgba(31, 91, 255, 0.3)" fill="none" />
      </svg>
      {points.map(([x, y, s], i) => (
        <i key={i} className={`pin ${s}`} style={{ left: x + '%', top: y + '%', background: col[s] || BLUE, '--d': i * 40 + 'ms' }} />
      ))}
      <div className="mapstats">
        <div><b>{done} / {total}</b><span>visits completed</span></div>
        <div><b>{total ? Math.round((done / total) * 100) : 0}%</b><span>coverage</span></div>
        <div><b>{priority}</b><span>priority merchants</span></div>
      </div>
      <div className="mapnote">SightPay Field Grid</div>
    </div>
  )
}

export const PriorityTable = ({ rows }) => (
  <table className="tbl">
    <thead>
      <tr><th>Merchant</th><th>Priority</th><th>Distance</th><th>QR Score</th><th>Trend</th></tr>
    </thead>
    <tbody>
      {rows.map((m) => (
        <tr key={m.id}>
          <td><b>{m.name}</b></td>
          <td><PriorityBadge level={m.pri} /></td>
          <td className="mu">{m.km} km</td>
          <td><span className="qrbar"><i style={{ width: m.qr + '%' }} /></span> {m.qr}</td>
          <td><Trend v={m.trend} /></td>
        </tr>
      ))}
    </tbody>
  </table>
)

export const ActivityTimeline = ({ items }) => (
  <ul className="tl">
    {items.map((a, i) => (
      <li key={i}>
        <VisitStatus s={a.s} />
        <div><b>{a.title}</b><div className="mu sm">{a.sub}</div></div>
        <span className="mu sm">{a.t}</span>
      </li>
    ))}
  </ul>
)

export const AlertCard = ({ a }) => (
  <div className="alert">
    <PriorityBadge level={a.sev} />
    <div className="grow"><b>{a.title}</b><div className="mu sm">{a.m}</div></div>
    <span className="mu sm">{a.at}</span>
  </div>
)

export const TransactionChart = ({ data }) => {
  const P = (d) => d.map((v, i) => `${(i / (d.length - 1)) * 300},${100 - v}`).join(' ')
  return (
    <div>
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="chart">
        <defs>
          <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={BLUE} stopOpacity=".2" />
            <stop offset="1" stopColor={BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgba(31, 91, 255, 0.08)" />)}
        <polygon points={`0,100 ${P(data.series[0].d)} 300,100`} fill="url(#ag)" />
        {data.series.map((s, i) => (
          <polyline
            key={s.name} points={P(s.d)} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth="2.4"
            vectorEffect="non-scaling-stroke" pathLength="1" className="ln"
          />
        ))}
      </svg>
      <div className="legend">
        {data.series.map((s, i) => (
          <span key={s.name}><i style={{ background: SERIES[i % SERIES.length] }} />{s.name}</span>
        ))}
        <span className="grow" />
        <span className="mu">{data.labels[0]} – {data.labels.at(-1)}</span>
      </div>
    </div>
  )
}