import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Footprints,
  LayoutGrid,
  Languages,
  Lock,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { merchants } from '../data/demoData'

const WORKSPACES = [
  {
    id: 'fse_mobile',
    icon: Smartphone,
    tag: 'FSE Mobile App',
    title: 'FSE Mobile Copilot (Mobile App)',
    text: 'Dedicated mobile experience for Field Sales Executives: Visit Queue, Geofence, Vision AI Capture & Sarvam Voice Guidance.',
    cta: 'Launch FSE Mobile App',
    to: '/fse/mobile',
  },
  {
    id: 'mgr',
    icon: LayoutGrid,
    tag: 'Admin / Manager',
    title: 'Admin / Manager Panel',
    text: 'Central operational control: Operations Dashboard, AI Priority Queue, Merchant 360, Visit Audit, Manager Command Center, and Impact Analytics.',
    cta: 'Enter Admin / Manager Panel',
    to: '/fse',
  },
]

const FACTS = [
  ['100 m', 'GPS check radius'],
  ['75+', 'Score that auto-pays'],
  ['+19%', 'Observed uplift'],
]

function Logo() {
  return (
    <span className="lg-logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#1F5BFF" />
        <circle cx="16" cy="16" r="6.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
        <circle cx="16" cy="16" r="2.2" fill="#FFFFFF" />
        <path d="M16 3.5v4M16 24.5v4M3.5 16h4M24.5 16h4" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      SightPay
    </span>
  )
}

export default function Login() {
  const nav = useNavigate()
  const [sel, setSel] = useState('fse_mobile')
  const [ready, setReady] = useState(false)

  const m = merchants?.[0] ?? {}
  const score = Math.max(0, Math.min(100, Number(m.qr) || 60))
  const pri = String(m.pri ?? 'normal')
  const isHigh = /high|urgent|critical/i.test(pri)
  const ws = WORKSPACES.find((w) => w.id === sel) || WORKSPACES[0]

  const R = 34
  const C = 2 * Math.PI * R

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 150)
    return () => clearTimeout(t)
  }, [])

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div className="lg">
      <style>{CSS}</style>

      {/* LEFT: brand + live audit preview */}
      <section className="lg-hero" onPointerMove={onMove}>
        <div className="lg-blob a" />
        <div className="lg-blob b" />
        <div className="lg-swirl" />

        <div className="lg-hero-in">
          <Logo />

          <div className="lg-copy">
            <h1>Field intelligence, at the counter.</h1>
            <p>
              SightPay connects merchant counter evidence, AI recommendations, and field execution into one evidence-backed product loop.
            </p>
          </div>

          <div className="lg-vis">
            <div className="lg-card">
              <div className="lg-card-top">
                <b>{m.name ?? 'Ramesh General Store'}</b>
                <span className={`lg-tag ${isHigh ? 'high' : ''}`}>{isHigh ? 'High priority' : 'Normal priority'}</span>
              </div>

              <div className="lg-card-main">
                <svg viewBox="0 0 84 84" className="lg-ring" role="img" aria-label={`QR visibility ${score} out of 100`}>
                  <circle cx="42" cy="42" r={R} fill="none" stroke="#EEF3FF" strokeWidth="8" />
                  <circle
                    cx="42" cy="42" r={R} fill="none" stroke="#1F5BFF" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={ready ? C * (1 - score / 100) : C}
                    transform="rotate(-90 42 42)" className="lg-ring-fill"
                  />
                  <text x="42" y="47" textAnchor="middle" className="lg-ring-n">{score}</text>
                </svg>

                <dl>
                  <div><dt>AI priority</dt><dd>{pri.charAt(0).toUpperCase() + pri.slice(1)}</dd></div>
                  <div><dt>QR visibility</dt><dd>{score}/100</dd></div>
                  <div><dt>Competitor</dt><dd>{m.competitor ?? 'PhonePe'}</dd></div>
                </dl>
              </div>

              <div className="lg-verified"><ShieldCheck size={14} /> Visit verified (Multi-signal 94/100)</div>
            </div>

            <div className="lg-pill p1"><span><ShieldCheck size={13} /></span>Geofence verified (43m)</div>
            <div className="lg-pill p2"><span><Languages size={13} /></span>Hindi Sarvam guidance ready</div>
            <div className="lg-pill p3 blur"><span><Wallet size={13} /></span>Incentive ₹50 eligible</div>
          </div>

          <div className="lg-facts">
            {FACTS.map(([v, l]) => (
              <div key={l}><b>{v}</b><span>{l}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT: workspace selection */}
      <section className="lg-form">
        <button type="button" className="lg-back" onClick={() => nav('/')}>Back to home</button>

        <form
          className="lg-box"
          onSubmit={(e) => {
            e.preventDefault()
            nav(ws.to)
          }}
        >
          <h2>Welcome to SightPay</h2>
          <p className="lg-sub">Select your operational workspace to proceed.</p>

          <div className="lg-ws" role="radiogroup" aria-label="Workspace">
            {WORKSPACES.map(({ id, icon: Icon, tag, title, text }) => {
              const on = sel === id
              return (
                <button
                  type="button"
                  key={id}
                  role="radio"
                  aria-checked={on}
                  className={`lg-wcard ${on ? 'on' : ''}`}
                  onClick={() => setSel(id)}
                >
                  <span className="lg-wico"><Icon size={20} strokeWidth={1.8} /></span>
                  <span className="lg-wtxt">
                    <span className="lg-wtag">{tag}</span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                  <span className="lg-radio">{on && <Check size={13} strokeWidth={3} />}</span>
                </button>
              )
            })}
          </div>

          <button type="submit" className="lg-go">
            {ws.cta} <ArrowRight size={16} />
          </button>

          <div className="lg-foot"><Lock size={13} /> Paytm Field Operations Intelligence Workspace</div>
        </form>
      </section>
    </div>
  )
}

const CSS = `
.lg{
  --ink:#0A1B3D; --ink2:#5B6E96; --line:#DDE7FB; --lime:#1F5BFF; --mist:#EEF3FF;
  min-height:100vh;display:grid;grid-template-columns:1.1fr .9fr;gap:14px;padding:14px;background:#F4F7FF;color:var(--ink);font-family:Inter,system-ui,sans-serif
}
.lg *{box-sizing:border-box}
.lg h1,.lg h2{margin:0;font-family:Sora,system-ui,sans-serif}
.lg p{margin:0}
.lg :focus-visible{outline:2px solid var(--lime);outline-offset:3px}

.lg-hero{position:relative;border-radius:34px;overflow:hidden;isolation:isolate;
  background:radial-gradient(ellipse at 10% 10%, rgba(31, 91, 255, 0.08), transparent 60%), #FFFFFF;
  border:1px solid var(--line);box-shadow:0 14px 36px -20px rgba(10,27,61,0.08)}
.lg-blob{position:absolute;z-index:0;border-radius:50%;filter:blur(80px);pointer-events:none}
.lg-blob.a{width:460px;height:380px;left:-140px;top:-110px;background:rgba(31,91,255,0.08)}
.lg-blob.b{width:400px;height:300px;right:0;bottom:0;background:rgba(156,192,255,0.12)}

.lg-hero-in{position:relative;z-index:2;height:100%;min-height:calc(100vh - 28px);display:flex;flex-direction:column;justify-content:space-between;gap:34px;padding:38px clamp(24px,4vw,56px)}
.lg-logo{display:inline-flex;align-items:center;gap:9px;font:700 18px Sora,sans-serif;letter-spacing:-.03em;color:var(--ink)}
.lg-copy h1{font-weight:700;font-size:clamp(32px,4vw,52px);line-height:1.08;letter-spacing:-.03em;color:var(--ink);max-width:11em}
.lg-copy p{margin-top:16px;max-width:42ch;font-size:15px;line-height:1.65;color:var(--ink2)}

.lg-vis{position:relative;width:min(400px,100%);padding:20px 0}
.lg-card{position:relative;z-index:2;padding:20px;border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 20px 40px -20px rgba(10,27,61,0.12)}
.lg-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.lg-card-top b{font:600 15px Sora,sans-serif;color:var(--ink)}
.lg-tag{padding:4px 10px;border-radius:99px;background:#EEF3FF;color:#1F5BFF;font-size:11.5px;font-weight:700;white-space:nowrap}
.lg-tag.high{background:#FEE2E2;color:#DC2626}
.lg-card-main{display:grid;grid-template-columns:84px 1fr;gap:18px;align-items:center;margin:16px 0}
.lg-ring{width:84px;height:84px}
.lg-ring-n{font:700 22px Sora,sans-serif;fill:var(--ink)}
.lg-card dl{margin:0;display:grid;gap:8px}
.lg-card dl div{display:flex;justify-content:space-between;gap:12px;font-size:13px}
.lg-card dt{color:var(--ink2)}
.lg-card dd{margin:0;font-weight:600}
.lg-verified{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:99px;background:#EEF3FF;color:#1F5BFF;font-size:12px;font-weight:600}

.lg-pill{position:absolute;z-index:3;display:flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:99px;background:#FFFFFF;border:1px solid var(--line);
  font-size:12px;font-weight:500;white-space:nowrap;box-shadow:0 12px 24px -12px rgba(10,27,61,0.15)}
.lg-pill span{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#FFFFFF;background:#1F5BFF}
.lg-pill.p1{top:-2px;right:-4%}
.lg-pill.p2{bottom:-2px;left:-4%}
.lg-pill.p3{top:46%;right:-8%}

.lg-facts{display:flex;flex-wrap:wrap;row-gap:16px}
.lg-facts div{padding:2px 22px;border-left:1px solid var(--line)}
.lg-facts div:first-child{padding-left:0;border-left:0}
.lg-facts b{display:block;font:700 26px/1 Sora,sans-serif;letter-spacing:-.03em;color:#1F5BFF}
.lg-facts span{display:block;margin-top:7px;font-size:11.5px;color:var(--ink2)}

/* form panel */
.lg-form{position:relative;display:grid;place-items:center;padding:40px 24px}
.lg-back{position:absolute;top:24px;right:24px;border:0;background:transparent;color:var(--ink2);font:500 13.5px Inter,sans-serif;cursor:pointer;padding:8px 12px;border-radius:99px}
.lg-back:hover{color:#1F5BFF;background:var(--mist)}
.lg-box{width:100%;max-width:440px}
.lg-box h2{font:700 30px Sora,sans-serif;letter-spacing:-.03em;color:#0A1B3D}
.lg-sub{margin-top:8px;color:var(--ink2);font-size:14px}
.lg-ws{display:grid;gap:12px;margin-top:26px}
.lg-wcard{display:flex;align-items:center;gap:16px;width:100%;padding:16px;border-radius:18px;background:#FFFFFF;border:1px solid var(--line);text-align:left;cursor:pointer;
  font-family:inherit;color:inherit;transition:all .2s;box-shadow:0 4px 12px -4px rgba(10,27,61,0.04)}
.lg-wcard:hover{border-color:rgba(31,91,255,0.4)}
.lg-wcard.on{border-color:#1F5BFF;background:#F8FAFF;box-shadow:0 0 0 3px rgba(31,91,255,0.12)}
.lg-wico{flex:none;width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:#EEF3FF;color:#1F5BFF}
.lg-wcard.on .lg-wico{background:#1F5BFF;color:#FFFFFF}
.lg-wtxt{flex:1;display:grid;gap:3px}
.lg-wtag{justify-self:start;padding:2px 9px;border-radius:99px;background:#EEF3FF;color:#1F5BFF;font-size:10px;font-weight:700}
.lg-wtxt strong{font:600 15px Sora,sans-serif;margin-top:3px;color:#0A1B3D}
.lg-wtxt small{font-size:12px;line-height:1.4;color:var(--ink2)}
.lg-radio{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;color:#FFFFFF}
.lg-wcard.on .lg-radio{background:#1F5BFF;border-color:#1F5BFF}
.lg-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:22px;padding:15px 24px;border:0;border-radius:99px;cursor:pointer;color:#FFFFFF;
  font:700 15px Inter,sans-serif;background:#1F5BFF;box-shadow:0 12px 28px -10px rgba(31,91,255,0.4);transition:all .2s}
.lg-go:hover{filter:brightness(1.08);transform:translateY(-1px)}
.lg-foot{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:20px;font-size:12px;color:var(--ink2)}

@media (max-width:900px){
  .lg{grid-template-columns:1fr}
  .lg-hero-in{min-height:0}
  .lg-pill{display:none}
}
`