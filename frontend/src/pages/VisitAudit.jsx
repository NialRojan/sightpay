import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronRight, Image as ImageIcon, MapPin, Play, RefreshCw, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import Layout from '../components/Layout'
import { PriorityBadge } from '../components/ui'
import { getVisit, analyzeVisit } from '../services/visits'

const VERIFY = [
  ['GPS', v => v.verification.gps],
  ['Timestamp', v => v.verification.timestamp],
  ['Geofence', v => v.verification.geofence],
  ['Image hash', v => v.verification.hash],
  ['Authenticity', v => v.verification.authenticity + '/100'],
]

const CHECKLIST = [
  { label: 'Paytm QR fully visible', points: 40, of: 40, pass: true },
  { label: 'QR near billing point', points: 0, of: 20, pass: false },
  { label: 'Soundbox present', points: 20, of: 20, pass: true },
  { label: 'Paytm more prominent', points: 0, of: 20, pass: false },
]
const SCORE = CHECKLIST.reduce((s, c) => s + c.points, 0)

export default function VisitAudit() {
  const { id = 'SP-10482' } = useParams()
  const nav = useNavigate()
  const [v, setV] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let alive = true
    getVisit(id).then(r => { if (alive) setV(r) }).catch(() => { if (alive) setV(null) })
    return () => { alive = false }
  }, [id])

  const flash = (text) => { setToast(text); setTimeout(() => setToast(null), 3200) }

  const runAnalysis = async () => {
    setProcessing(true)
    try { setV(await analyzeVisit(id)) } finally { setProcessing(false) }
  }

  const playVoice = () => {
    if (!v?.guidance?.audio) {
      flash('Audio preview unavailable - text guidance active.')
      return
    }
    setPlaying(true)
    flash('Playing voice guidance…')
    setTimeout(() => setPlaying(false), 2400)
  }

  const executeIntervention = () => flash('Intervention marked completed & logged to n8n execution engine.')

  if (!v) return <Layout crumb="Visit audit"><div className="pad mu">Loading visit evidence…</div></Layout>

  return (
    <Layout crumb="Visit Audit">
      <style>{`
        .va-crumb{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink2,#929A94);margin-bottom:16px}
        .va-crumb span{cursor:pointer}.va-crumb span:hover{color:var(--lime,#B7FF3C)}
        .va-crumb b{font-weight:400;opacity:.5}

        .va-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px;flex-wrap:wrap}
        .va-eyebrow{font-size:11px;color:var(--lime,#B7FF3C);font-weight:700;letter-spacing:0.05em;margin-bottom:4px}
        .va-head h1{font-family:Sora,sans-serif;font-size:28px;font-weight:700;letter-spacing:-.02em;color:var(--ink,#F5F7F4)}
        .va-head-actions{display:flex;align-items:center;gap:10px}
        .va-verified{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--lime,#B7FF3C);background:rgba(183,255,60,0.1);border:1px solid rgba(183,255,60,0.25);border-radius:999px;padding:6px 14px}

        .va-vrow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
        .va-vchip{display:inline-flex;align-items:center;gap:6px;background:#111515;border:1px solid rgba(245,247,244,0.08);border-radius:999px;padding:7px 12px 7px 8px;font-size:12px}
        .va-vchip .ok{width:18px;height:18px;border-radius:999px;background:rgba(183,255,60,0.1);color:var(--lime,#B7FF3C);display:grid;place-items:center;flex-shrink:0}
        .va-vchip span{color:var(--ink2,#929A94)}
        .va-vchip b{color:var(--ink,#F5F7F4);font-weight:600}

        /* HERO */
        .va-hero{padding:0;overflow:hidden;margin-bottom:14px;background:#111515;border:1px solid var(--line-lime)}
        .va-hero-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:0}
        @media (max-width:900px){.va-hero-grid{grid-template-columns:1fr}}

        .va-hero-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:0}
        @media (max-width:900px){.va-hero-grid{grid-template-columns:1fr}}

        .va-photo{
          position:relative;min-height:300px;
          background:linear-gradient(165deg,#EEF3FF,#F4F7FF);
          border-right:1px solid #DDE7FB;
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
          padding:24px;
        }
        @media (max-width:900px){.va-photo{border-right:0;border-bottom:1px solid #DDE7FB}}

        .va-chip-float{position:absolute;top:16px;left:16px;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#1F5BFF;background:rgba(255,255,255,.9);border:1px solid rgba(31,91,255,0.25);border-radius:999px;padding:6px 12px}

        .va-score{width:128px;height:128px;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 30px rgba(31,91,255,0.2);background:#EEF3FF}
        .va-score-inner{width:98px;height:98px;border-radius:50%;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(10,27,61,0.06)}
        .va-score-inner b{font-family:Sora,sans-serif;font-size:30px;line-height:1;color:#1F5BFF}
        .va-score-inner span{font-size:11px;color:#5B6E96;margin-top:3px}

        .va-detect-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
        .va-detect-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;background:#FFFFFF;border:1px solid #DDE7FB}
        .va-detect-chip.pass{color:#1F5BFF;border-color:rgba(31,91,255,0.3)}
        .va-detect-chip.fail{color:#5B6E96}

        .va-side{padding:22px 24px;display:flex;flex-direction:column}
        .va-side-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
        .va-side-head h2{font-size:16px;color:#0A1B3D}

        .va-check{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
        .va-check-row{display:flex;flex-direction:column;gap:5px}
        .va-check-top{display:flex;align-items:center;justify-content:space-between;font-size:13px}
        .va-check-label{display:flex;align-items:center;gap:8px;color:#0A1B3D}
        .va-check-label .dot{width:18px;height:18px;border-radius:999px;display:grid;place-items:center;flex-shrink:0}
        .va-check-label .dot.pass{background:#1F5BFF;color:#FFFFFF}
        .va-check-label .dot.fail{background:#EEF3FF;color:#5B6E96}
        .va-check-top b{font-size:12px;color:#5B6E96;font-weight:600}
        .va-check-bar{height:5px;border-radius:99px;background:#EEF3FF;overflow:hidden}
        .va-check-bar i{display:block;height:100%;border-radius:99px;background:#1F5BFF}

        .va-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
        .va-stat{background:#EEF3FF;border:1px solid #DDE7FB;border-radius:14px;padding:8px 12px;display:flex;flex-direction:column;gap:2px;flex:1;min-width:110px}
        .va-stat span{font-size:10px;color:#5B6E96}
        .va-stat b{font-size:13px;color:#0A1B3D;display:flex;align-items:center;gap:5px}

        .va-decision-bar{
          grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
          padding:18px 24px;background:#EEF3FF;border-top:1px solid #DDE7FB;color:#0A1B3D;
        }
        .va-decision-bar p{font-size:13px;color:#5B6E96}
        .va-decision-bar b{font-family:Sora,sans-serif;font-size:15px;color:#1F5BFF;display:block;margin-bottom:2px}
        .va-decision-bar .btn.p{background:#1F5BFF;color:#FFFFFF;font-weight:700}

        /* LOWER ROW */
        .va-lower{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;margin-bottom:14px}
        @media (max-width:900px){.va-lower{grid-template-columns:1fr}}

        .va-chain{display:flex;flex-direction:column;gap:0;margin-top:12px}
        .va-chain-item{display:flex;gap:12px;align-items:flex-start;position:relative;padding-bottom:16px}
        .va-chain-item:last-child{padding-bottom:0}
        .va-chain-item>div:last-of-type{display:flex;flex-direction:column;gap:1px}
        .va-chain-item b{font-size:13px;color:#0A1B3D}
        .va-chain-item span{font-size:12px;color:#5B6E96}
        .va-chain-dot{width:22px;height:22px;border-radius:999px;background:#1F5BFF;color:#FFFFFF;display:grid;place-items:center;flex-shrink:0;z-index:1;font-weight:800}
        .va-chain-line{position:absolute;left:11px;top:22px;bottom:0;width:1px;background:#DDE7FB}

        .va-auth-top{display:flex;align-items:center;gap:14px;margin:12px 0 14px}
        .va-auth-top b{font-family:Sora,sans-serif;font-size:32px;color:#1F5BFF}
        .va-auth-top span{font-size:12px;color:#5B6E96}
        .va-signals{display:grid;gap:7px;margin-bottom:12px}
        .va-signals div{display:flex;justify-content:space-between;font-size:12px;color:#5B6E96}
        .va-signals b{color:#1F5BFF;font-weight:700}
        .va-auth-note{font-size:12px;color:#5B6E96;line-height:1.5}

        .va-pipe{display:flex;align-items:center;gap:4px;overflow-x:auto;padding:14px 0 16px;margin-bottom:14px;border-bottom:1px solid #DDE7FB}
        .va-pipe-step{display:flex;align-items:center;gap:6px;flex-shrink:0;font-size:12px;color:#5B6E96}
        .va-pipe-step .dot{width:20px;height:20px;border-radius:999px;background:#1F5BFF;color:#FFFFFF;display:grid;place-items:center;flex-shrink:0;font-weight:800}
        .va-pipe-step b{color:#0A1B3D;font-weight:600}

        .va-message{background:#EEF3FF;border:1px solid #DDE7FB;border-radius:16px;padding:14px 16px;margin-bottom:14px}
        .va-message p{font-size:14px;color:#0A1B3D;line-height:1.6}

        .va-toast{
          position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100;
          display:flex;align-items:center;gap:10px;background:#FFFFFF;color:#0A1B3D;
          border-radius:999px;padding:10px 18px;font-size:13px;border:1px solid #1F5BFF;
          box-shadow:0 16px 40px -14px rgba(10,27,61,0.15);
        }
      `}</style>

      <div className="pad">
        <div className="va-crumb">
          <span onClick={() => nav('/queue')}>Priority Queue</span><b>/</b><span>Visit Audit #{v.id}</span>
        </div>

        <div className="va-head">
          <div>
            <div className="va-eyebrow">ENTERPRISE FIELD EVIDENCE</div>
            <h1>Visit Audit & Verification</h1>
            <p className="mu top16">{v.merchant.name} · {v.date} · {v.time} · FSE Aarav Sharma</p>
          </div>
          <div className="va-head-actions">
            <span className="va-verified"><Check size={14} /> Multi-Signal Verified</span>
            <button className="btn" onClick={runAnalysis}>
              <RefreshCw size={15} /> {processing ? 'Analyzing…' : 'Re-run Vision AI'}
            </button>
          </div>
        </div>

        <div className="va-vrow">
          {VERIFY.map(([label, get], i) => (
            <div className="va-vchip" key={label}>
              {(i === 0 || i === 1 || i === 3) && <span className="ok"><Check size={11} /></span>}
              <span>{label}</span><b>{get(v)}</b>
            </div>
          ))}
        </div>

        {/* HERO: photo + score + checklist + decision */}
        <section className="card va-hero">
          <div className="va-hero-grid">
            <div className="va-photo">
              <div className="va-chip-float"><ImageIcon size={13} /> Hash Matched (No Reuse)</div>

              <div className="va-score" style={{ background: `conic-gradient(#B7FF3C ${SCORE * 3.6}deg, rgba(245,247,244,0.1) 0deg)` }}>
                <div className="va-score-inner">
                  <b>{SCORE}</b>
                  <span>of 100</span>
                </div>
              </div>

              <div className="va-detect-row">
                {CHECKLIST.map(c => (
                  <span className={`va-detect-chip ${c.pass ? 'pass' : 'fail'}`} key={c.label}>
                    {c.pass ? <Check size={12} /> : <X size={12} />} {c.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="va-side">
              <div className="va-side-head">
                <h2>Counter Vision Rubric</h2>
                <Sparkles size={16} color="#B7FF3C" />
              </div>
              <span className="mu sm">{SCORE} of 100 visibility score — evaluated by Vision AI</span>

              <div className="va-check">
                {CHECKLIST.map(c => (
                  <div className="va-check-row" key={c.label}>
                    <div className="va-check-top">
                      <span className="va-check-label">
                        <span className={`dot ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? <Check size={11} /> : <X size={11} />}</span>
                        {c.label}
                      </span>
                      <b>{c.points}/{c.of}</b>
                    </div>
                    <div className="va-check-bar"><i style={{ width: `${(c.points / c.of) * 100 || 4}%` }} /></div>
                  </div>
                ))}
              </div>

              <div className="va-stats">
                <div className="va-stat"><span>Vision Confidence</span><b>93%</b></div>
                <div className="va-stat"><span>Geofence Proximity</span><b><MapPin size={12} /> 43m (Passed)</b></div>
                <div className="va-stat"><span>Competitor</span><b>PhonePe <PriorityBadge level="HIGH" /></b></div>
              </div>
            </div>

            <div className="va-decision-bar">
              <div>
                <b>Intervention Required: Reposition Paytm QR</b>
                <p>QR visibility is below 50/100 threshold and PhonePe dominates primary counter.</p>
              </div>
              <button className="btn p" onClick={executeIntervention}>
                Execute Intervention <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {/* Evidence timeline + authenticity */}
        <section className="va-lower">
          <div className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              <div><h2>Enterprise Evidence Chain</h2><span className="mu sm">Audit trail of visit events</span></div>
              <ShieldCheck size={16} color="#B7FF3C" />
            </div>
            <div className="va-chain">
              {v.evidenceChain.map(([t, label], i) => (
                <div className="va-chain-item" key={t}>
                  <div className="va-chain-dot"><Check size={11} /></div>
                  <div><b>{t}</b><span>{label}</span></div>
                  {i < v.evidenceChain.length - 1 && <div className="va-chain-line" />}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="row">
              <h2>Visit Authenticity Score</h2>
            </div>
            <div className="va-auth-top">
              <b>94</b><span>/100 · Multi-signal consistency assessment</span>
            </div>
            <div className="va-signals">
              {v.authenticitySignals.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
            </div>
            <p className="va-auth-note">No individual signal proves authenticity on its own — multi-signal validation confirms evidence consistency with merchant profile.</p>
          </div>
        </section>

        {/* Automation pipeline + Sarvam merchant guidance */}
        <section className="card">
          <div className="row">
            <div><div className="va-eyebrow">SARVAM + N8N AUTOMATION PIPELINE</div><h2>Merchant Guidance Output</h2></div>
            <span className="pill ev">Language: Hindi</span>
          </div>

          <div className="va-pipe">
            {['Vision AI Analysis', 'Decision Engine', 'Sarvam Hindi Nudge', 'n8n Switch', 'Merchant Memory Graph'].map((label, i, arr) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center' }}>
                <span className="va-pipe-step"><span className="dot"><Check size={11} /></span><b>{label}</b></span>
                {i < arr.length - 1 && <ChevronRight size={16} color="rgba(245,247,244,0.3)" style={{ margin: '0 8px' }} />}
              </span>
            ))}
          </div>

          <div className="va-message"><p>{v.guidance.message}</p></div>
          <div className="row">
            <button className="btn" onClick={playVoice}>
              <Play size={15} /> {playing ? 'Playing Voice...' : 'Play Voice Preview'}
            </button>
            <button className="btn" onClick={() => flash('Sarvam Hindi WhatsApp nudge re-sent to merchant.')}>
              <Send size={15} /> Send WhatsApp Nudge
            </button>
          </div>
        </section>
      </div>

      {toast && (
        <div className="va-toast">
          <Check size={15} color="#B7FF3C" /> {toast}
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 0, color: '#929A94', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
    </Layout>
  )
}