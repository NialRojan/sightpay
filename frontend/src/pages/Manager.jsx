import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  MapPin,
  ShieldAlert,
  X,
} from 'lucide-react'
import Layout from '../components/Layout'
import { managerKpis, exceptions, fsePerformance, mapPoints } from '../data/demoData'
import { approveEscalation, rejectEscalation } from '../services/audits'

const SYSTEMS = ['Vision AI', 'Sarvam', 'n8n Workflow Engine', 'Cognee Memory Graph', 'Transaction Outcome Engine']
const TIER_LABEL = { done: 'Verified', pending: 'Pending', high: 'Suspicious' }

function tierOf(s) {
  const v = String(s).toLowerCase()
  if (/done|verif|ok|green|complete/.test(v)) return 'done'
  if (/high|susp|red|risk|alert/.test(v)) return 'high'
  return 'pending'
}

const isWarn = (type) => /red|amb|warn|high|risk/.test(String(type).toLowerCase())

function percentOf(value) {
  const text = String(value)
  const n = parseFloat(text)
  return text.includes('%') && Number.isFinite(n) ? Math.min(n, 100) : null
}

export default function Manager() {
  const [drawer, setDrawer] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const closeDrawer = () => {
    setDrawer(null)
    setNote('')
    setError('')
  }

  const act = async (kind) => {
    if (!drawer || busy) return
    setBusy(true)
    setError('')
    try {
      if (kind === 'approve') await approveEscalation(drawer.id, note)
      if (kind === 'reject') await rejectEscalation(drawer.id, note)
      closeDrawer()
    } catch (err) {
      setError(err?.message || 'Action failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!drawer) return
    const onKey = (e) => e.key === 'Escape' && closeDrawer()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const pins = useMemo(() => (mapPoints || []).map(([x, y, s]) => ({ x, y, tier: tierOf(s) })), [])
  const summary = useMemo(() => {
    const out = {}
    ;['done', 'pending', 'high'].forEach((t) => {
      const list = pins.filter((p) => p.tier === t)
      out[t] = {
        count: list.length,
        x: list.length ? list.reduce((s, p) => s + p.x, 0) / list.length : 0,
        y: list.length ? list.reduce((s, p) => s + p.y, 0) / list.length : 0,
      }
    })
    return out
  }, [pins])

  return (
    <Layout crumb="Command Center">
      <style>{CSS}</style>

      <div className="mg">
        {/* HEADER */}
        <div className="mg-head">
          <div>
            <span className="pill ev">OPERATIONS INTELLIGENCE</span>
            <h1 style={{ marginTop: 6 }}>Manager Command Center</h1>
            <p className="mu">Monitor field activity, multi-signal evidence, exceptions and automation workflows across regions.</p>
          </div>
          <div className="mg-head-actions">
            <button className="mg-btn">Today <ChevronDown size={14} /></button>
            <button className="mg-btn">Region: Mumbai Zone <ChevronDown size={14} /></button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mg-kpis">
          {managerKpis.map(([label, value, type]) => (
            <div className={`mg-kpi ${isWarn(type) ? 'warn' : ''}`} key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>

        {/* MAP + EXCEPTIONS */}
        <div className="mg-grid">
          <section className="mg-card">
            <div className="mg-card-head">
              <div>
                <h2>Live Field Coverage & Priority Radar</h2>
                <small>Real-time location signals & verified merchant points</small>
              </div>
              <div className="mg-legend">
                {['done', 'pending', 'high'].map((t) => (
                  <span key={t}><i className={t} />{TIER_LABEL[t]} <b>{summary[t].count}</b></span>
                ))}
              </div>
            </div>

            <div className="mg-map" role="img" aria-label="Field coverage map">
              <div className="mg-scan" />
              {pins.map((p, i) => (
                <i key={i} className={`mg-pin ${p.tier}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} />
              ))}
              {summary.high.count > 0 && (
                <div className="mg-callout" style={{ left: `${summary.high.x}%`, top: `${summary.high.y}%` }}>
                  <span>Suspicious</span><b>{summary.high.count}</b>
                </div>
              )}
              {summary.pending.count > 0 && (
                <div className="mg-callout soft" style={{ left: `${summary.pending.x}%`, top: `${summary.pending.y}%` }}>
                  <span>Pending</span><b>{summary.pending.count}</b>
                </div>
              )}
            </div>
          </section>

          <section className="mg-card">
            <div className="mg-card-head">
              <div>
                <h2>Exceptions Requiring Attention</h2>
                <small>Actionable manager review queue</small>
              </div>
              <span className="mg-ico"><ShieldAlert size={17} color="#B7FF3C" /></span>
            </div>

            <div className="mg-ex-list">
              {exceptions.map((e) => (
                <div className="mg-ex" key={e.id}>
                  <span className={`mg-ex-ico ${isWarn(e.severity) ? 'warn' : ''}`}><AlertTriangle size={15} /></span>
                  <div className="mg-ex-body">
                    <span className={`mg-ex-type ${isWarn(e.severity) ? 'warn' : ''}`}>{e.type}</span>
                    <b>{e.merchant}</b>
                    <span>{e.detail}</span>
                    <small className="mu">{e.sub}</small>
                  </div>
                  <button className="mg-btn" onClick={() => setDrawer(e)}>
                    {e.action} <ChevronRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* FSE TABLE */}
        <section className="mg-card">
          <div className="mg-card-head">
            <div>
              <h2>FSE Operational Coverage</h2>
              <small>Field execution visibility & evidence compliance monitoring</small>
            </div>
            <span className="mg-pill">Today's Shift</span>
          </div>

          <div className="mg-table-wrap">
            <div className="mg-table">
              <div className="mg-tr head">
                {['FSE NAME', 'ASSIGNED', 'VERIFIED', 'INTERVENTIONS', 'COVERAGE %', 'EXCEPTIONS'].map((h) => <span key={h}>{h}</span>)}
              </div>
              {fsePerformance.map((row) => (
                <div className="mg-tr" key={row[0]}>
                  {row.map((cell, i) => {
                    const pct = i === 4 ? percentOf(cell) : null
                    return (
                      <span key={i} className={i === 0 ? 'name' : ''}>
                        {i === 5 && Number(cell) > 0 ? <em className="mg-alert">{cell}</em> : cell}
                        {pct !== null && <u><i style={{ width: `${pct}%` }} /></u>}
                      </span>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AUTOMATION HEALTH */}
        <section className="mg-card">
          <div className="mg-card-head">
            <div>
              <h2>System Architecture & Automation Health</h2>
              <small>Pipeline status powering field decision loops</small>
            </div>
            <span className="mg-pill">{SYSTEMS.length} / {SYSTEMS.length} All Operational</span>
          </div>
          <div className="mg-systems">
            {SYSTEMS.map((name) => (
              <div key={name}>
                <span className="mg-sysdot" />
                <b>{name}</b>
                <small className="lime">Operational (100% Uptime)</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* REVIEW DRAWER */}
      {drawer && (
        <div className="mg-backdrop" onClick={closeDrawer}>
          <aside className="mg-drawer card" role="dialog" aria-modal="true" aria-labelledby="mg-drawer-title" onClick={(e) => e.stopPropagation()}>
            <div className="mg-drawer-head">
              <div>
                <span className="pill ev">EXCEPTION AUDIT</span>
                <h2 id="mg-drawer-title" style={{ marginTop: 4 }}>{drawer.merchant}</h2>
                <span className="mu sm">Audit ID: {drawer.id}</span>
              </div>
              <button className="mg-close" onClick={closeDrawer} aria-label="Close review"><X size={18} /></button>
            </div>

            <div className="mg-dsec">
              <b>Multi-Signal Visit Evidence</b>
              <div className="mg-evidence">
                <span><MapPin size={15} color="#B7FF3C" /> GPS Check: 2.4km mismatch</span>
                <span><CheckCircle2 size={15} color="#B7FF3C" /> Image Quality: Good</span>
                <span><ShieldAlert size={15} color="#FF6B5F" /> Vision Confidence: 54%</span>
                <span><Clock3 size={15} color="#B7FF3C" /> Hash Check: Matched</span>
              </div>
            </div>

            <div className="mg-dsec">
              <b>Contextual Merchant Record</b>
              <p className="mu sm">
                Repeated field signal mismatches require manager approval before incentive payout or merchant re-visit is triggered.
              </p>
            </div>

            <label className="mg-note">
              <span>Manager Review Note</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Enter audit review comments..." rows={4} />
            </label>

            {error && <div className="mg-error" role="alert">{error}</div>}

            <div className="mg-drawer-actions">
              <button className="mg-btn" disabled={busy} onClick={() => act('reject')}>Reject Visit</button>
              <button className="mg-btn" disabled={busy} onClick={() => act('approve')}>Approve Exception</button>
              <button className="mg-btn primary" disabled={busy} onClick={() => act('escalate')}>Escalate to Regional</button>
            </div>
          </aside>
        </div>
      )}
    </Layout>
  )
}

const CSS = `
.mg{--ink:#0A1B3D;--ink2:#5B6E96;--line:#DDE7FB;--lime:#1F5BFF;--navy:#0B2A8A;--mist:#EEF3FF;
  display:grid;gap:14px;padding:4px 2px 28px;color:var(--ink)}
.mg *{box-sizing:border-box}
.mg h1,.mg h2{margin:0;font-family:Sora,sans-serif;letter-spacing:-.025em;color:#0A1B3D}
.mg p{margin:0}

.mg-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:6px 4px 4px}
.mg-head h1{font-size:clamp(26px,3vw,36px);font-weight:700;line-height:1.1}
.mg-head p{margin-top:6px;font-size:14px;color:var(--ink2)}
.mg-head-actions{display:flex;gap:8px}

.mg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:999px;cursor:pointer;background:var(--mist);color:var(--lime);
  border:1px solid var(--line);font:600 13px Inter,sans-serif;transition:.16s;white-space:nowrap}
.mg-btn:hover:not(:disabled){border-color:var(--lime);color:var(--navy);background:#E3EDFF}
.mg-btn:disabled{opacity:.55;cursor:not-allowed}
.mg-btn.primary{background:var(--lime);border-color:var(--lime);color:#FFFFFF;font-weight:700}
.mg-btn.primary:hover:not(:disabled){background:#174FE0;color:#FFFFFF}

.mg-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.mg-kpi{position:relative;padding:18px 20px;border-radius:20px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 30px -10px rgba(10,27,61,0.06);overflow:hidden}
.mg-kpi span{display:block;font-size:12px;color:var(--ink2);font-weight:600}
.mg-kpi b{display:block;margin-top:8px;font:700 30px/1 Sora,sans-serif;color:var(--ink)}
.mg-kpi.warn b{color:var(--lime)}

.mg-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:14px}
@media(max-width:1100px){.mg-grid{grid-template-columns:1fr}}

.mg-card{padding:22px;border-radius:22px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 30px -10px rgba(10,27,61,0.06);min-width:0}
.mg-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.mg-card-head h2{font-size:17px;font-weight:600;color:#0A1B3D}
.mg-card-head small{display:block;margin-top:4px;font-size:12px;color:var(--ink2)}
.mg-ico{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--mist);color:var(--lime);border:1px solid var(--line)}
.mg-pill{display:inline-block;padding:5px 12px;border-radius:99px;background:var(--mist);color:var(--lime);font-size:11px;font-weight:700;border:1px solid var(--line)}

.mg-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--ink2)}
.mg-legend span{display:flex;align-items:center;gap:6px}
.mg-legend b{color:var(--ink)}
.mg-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;border:1px solid var(--lime)}
.mg-legend i.done{background:var(--lime)}
.mg-legend i.pending{background:#1F5BFF}
.mg-legend i.high{background:#DC2626}

.mg-map{position:relative;height:380px;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#EEF3FF}
.mg-scan{position:absolute;top:0;bottom:0;width:120px;left:-120px;background:linear-gradient(90deg,transparent,rgba(31,91,255,0.08),transparent);border-right:1px solid rgba(31,91,255,0.2);animation:mgScan 8s linear infinite}
.mg-pin{position:absolute;width:12px;height:12px;transform:translate(-50%,-50%);border-radius:50%;background:var(--lime);box-shadow:0 0 10px var(--lime)}
.mg-pin.high{background:#DC2626;box-shadow:0 0 10px #DC2626}
.mg-pin.pending{background:#1F5BFF;box-shadow:0 0 10px #1F5BFF}
.mg-callout{position:absolute;transform:translate(-50%,-140%);display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:99px;background:#FEE2E2;color:#DC2626;font-size:11px;font-weight:800;pointer-events:none}
.mg-callout.soft{background:#EEF3FF;color:var(--lime);border:1px solid var(--line)}

.mg-ex-list{display:grid;gap:10px}
.mg-ex{display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;background:#F8FAFF;border:1px solid var(--line)}
.mg-ex-ico{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#EEF3FF;color:var(--lime)}
.mg-ex-ico.warn{color:#DC2626;background:#FEE2E2}
.mg-ex-body{flex:1;min-width:0;display:grid;gap:2px}
.mg-ex-body b{font-size:14px;color:var(--ink)}
.mg-ex-body span{font-size:12px;color:var(--ink2)}
.mg-ex-type{justify-self:start;padding:2px 8px;border-radius:99px;background:#EEF3FF;color:var(--lime);font-size:10px;font-weight:800}

.mg-table-wrap{overflow-x:auto}
.mg-table{min-width:640px}
.mg-tr{display:grid;grid-template-columns:1.6fr repeat(5,1fr);gap:12px;align-items:center;padding:12px 10px;border-bottom:1px solid var(--line);font-size:13px}
.mg-tr.head{font-size:11px;font-weight:700;color:var(--ink2)}
.mg-tr .name{font-weight:600}
.mg-tr u{display:block;height:4px;margin-top:4px;border-radius:99px;background:#EEF3FF;overflow:hidden;text-decoration:none}
.mg-tr u i{display:block;height:100%;border-radius:99px;background:var(--lime)}
.mg-alert{display:inline-block;padding:2px 8px;border-radius:99px;background:#FEE2E2;color:#DC2626;font:800 11px Inter,sans-serif}

.mg-systems{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.mg-systems div{display:grid;gap:4px;padding:14px;border-radius:16px;background:#F8FAFF;border:1px solid var(--line)}
.mg-systems b{font-size:13px;color:#0A1B3D}
.mg-sysdot{width:8px;height:8px;border-radius:50%;background:var(--lime);box-shadow:0 0 8px var(--lime)}

.mg-backdrop{position:fixed;inset:0;z-index:100;display:flex;justify-content:flex-end;background:rgba(10,27,61,0.4);backdrop-filter:blur(4px)}
.mg-drawer{width:min(460px,100%);height:100%;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px;background:#FFFFFF;border-left:1px solid var(--line)}
.mg-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.mg-close{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;cursor:pointer;background:var(--mist);color:var(--ink2)}
.mg-dsec b{display:block;font-size:13px;margin-bottom:8px;color:#0A1B3D}
.mg-evidence{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mg-evidence span{display:flex;align-items:center;gap:8px;padding:10px;border-radius:12px;background:var(--mist);border:1px solid var(--line);font-size:11px;color:var(--ink)}
.mg-note textarea{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:#FFFFFF;color:var(--ink);font:400 13px Inter,sans-serif;outline:0}
.mg-drawer-actions{display:flex;gap:10px;margin-top:auto}

@keyframes mgScan{to{transform:translateX(100vw)}}
`