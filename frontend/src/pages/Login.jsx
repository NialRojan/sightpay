import { T, LanguagePicker, useLanguage } from '../components/Language'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  LayoutGrid,
  Languages,
  MapPin,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wallet,
} from 'lucide-react'
import { listFse } from '../services/fse'
import { listMerchants, getMerchantDetail } from '../services/merchants'
import { getPortfolioImpact } from '../services/analytics'
import {
  getCurrentFse,
  getManagerName,
  getRole,
  setCurrentFse,
  setManagerName,
  setRole,
} from '../services/session'
import { DECISION_LABEL, fmtPct } from '../services/format'

const WORKSPACES = [
  {
    id: 'fse',
    icon: Smartphone,
    tag: 'Field rep',
    title: 'Field Sales Executive',
    text: 'Choose your name to see today’s visits.',
    cta: 'Continue as field rep',
    to: '/fse',
  },
  {
    id: 'manager',
    icon: LayoutGrid,
    tag: 'Manager',
    title: 'Admin / Manager Panel',
    text: 'Review flagged visits and team performance.',
    cta: 'Enter Manager Command Center',
    to: '/manager',
  },
]

const LANG_NAME = { 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil', 'en-IN': 'English', 'gu-IN': 'Gujarati' }

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
  const { t } = useLanguage()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const initialRole = params.get('role') === 'manager' || params.get('role') === 'fse' ? params.get('role') : getRole()
  const [sel, setSel] = useState(initialRole === 'manager' ? 'manager' : 'fse')
  const [ready, setReady] = useState(false)

  // Reps from GET /fse
  const [reps, setReps] = useState(null)
  const [repsError, setRepsError] = useState(null)
  const [fseId, setFseId] = useState(() => getCurrentFse()?.id ?? null)
  const [managerName, setManagerNameInput] = useState(() => getManagerName())
  const [formError, setFormError] = useState('')

  // Hero card: the lowest-scoring merchant + portfolio observed change (real data)
  const [hero, setHero] = useState(null)
  const [heroError, setHeroError] = useState(null)
  const [impact, setImpact] = useState(null)

  useEffect(() => {
    let alive = true
    listFse()
      .then((rows) => {
        if (!alive) return
        setReps(rows)
        setFseId((cur) => (cur && rows.some((r) => r.id === Number(cur)) ? Number(cur) : rows[0]?.id ?? null))
      })
      .catch((e) => alive && setRepsError(e))

    listMerchants()
      .then(async (rows) => {
        // the weakest counter with a real audit result (unusable photos score 0 and would skew this)
        const byScore = (a, b) => a.latest_score - b.latest_score
        const nonCompliant = rows.filter((m) => m.latest_decision === 'non_compliant' && m.latest_score != null).sort(byScore)
        const scored = rows.filter((m) => m.latest_score != null).sort(byScore)
        const pick = nonCompliant[0] || scored[0] || rows[0]
        if (!pick) return null
        const detail = await getMerchantDetail(pick.id)
        return { m: pick, detail }
      })
      .then((h) => alive && setHero(h))
      .catch((e) => alive && setHeroError(e))

    getPortfolioImpact()
      .then((d) => alive && setImpact(d))
      .catch(() => alive && setImpact({ overall_avg_change_pct: null }))

    return () => {
      alive = false
    }
  }, [])

  const m = hero?.m ?? {}
  const latest = hero?.detail?.recent_visits?.[0]
  const score = Math.max(0, Math.min(100, Number(m.latest_score) || 0))
  const openIssue = ['non_compliant', 'low_confidence'].includes(m.latest_decision)
  const isHigh = openIssue && score < 60
  const ws = WORKSPACES.find((w) => w.id === sel) || WORKSPACES[0]

  const FACTS = [
    ['100 m', 'GPS check radius'],
    ['₹50', 'Per verified compliant visit'],
    [impact ? fmtPct(impact.overall_avg_change_pct) : '…', 'Avg observed change'],
  ]

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

  const submit = (e) => {
    e.preventDefault()
    setFormError('')
    if (sel === 'fse') {
      const rep = reps?.find((r) => r.id === Number(fseId))
      if (!rep) {
        setFormError(repsError ? `Cannot load reps: ${repsError.message}` : 'Choose your name first.')
        return
      }
      setRole('fse')
      setCurrentFse(rep)
      nav(ws.to)
    } else {
      const name = managerName.trim()
      if (!name) {
        setFormError('Enter your name: it is recorded as the approver on escalations.')
        return
      }
      setRole('manager')
      setManagerName(name)
      nav(ws.to)
    }
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
            <h1><T>Field intelligence, at the counter.</T></h1>
            <p>
              SightPay connects merchant counter evidence, AI recommendations, and field execution into one evidence-backed product loop.
            </p>
          </div>

          <div className="lg-vis">
            <div className="lg-card">
              <div className="lg-card-top">
                <b>{m.name ?? (heroError ? 'Merchants unavailable' : 'Loading merchant…')}</b>
                <span className={`lg-tag ${isHigh ? 'high' : ''}`}>{openIssue ? (isHigh ? 'High priority' : 'Open issue') : 'Normal priority'}</span>
              </div>

              <div className="lg-card-main">
                <svg viewBox="0 0 84 84" className="lg-ring" role="img" aria-label={`QR visibility ${score} out of 100`}>
                  <circle cx="42" cy="42" r={R} fill="none" stroke="#EEF3FF" strokeWidth="8" />
                  <circle
                    cx="42" cy="42" r={R} fill="none" stroke="#1F5BFF" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={ready ? C * (1 - score / 100) : C}
                    transform="rotate(-90 42 42)" className="lg-ring-fill"
                  />
                  <text x="42" y="47" textAnchor="middle" className="lg-ring-n">{m.latest_score ?? '—'}</text>
                </svg>

                <dl>
                  <div><dt>Last decision</dt><dd>{DECISION_LABEL[m.latest_decision] ?? '—'}</dd></div>
                  <div><dt>QR visibility</dt><dd>{m.latest_score != null ? `${m.latest_score}/100` : '—'}</dd></div>
                  <div><dt>Assigned rep</dt><dd>{m.assigned_fse_name ?? '—'}</dd></div>
                </dl>
              </div>

              <div className="lg-verified">
                <ShieldCheck size={14} />
                {latest?.authenticity_score != null
                  ? `Last visit: combined evidence signals ${latest.authenticity_score}/100`
                  : heroError ? heroError.message : 'Combined evidence signals'}
              </div>
            </div>

            <div className="lg-pill p1"><span><MapPin size={13} /></span>{m.address || m.category || 'GPS check within 100 m'}</div>
            <div className="lg-pill p2"><span><Languages size={13} /></span>Guidance in {LANG_NAME[m.language] || m.language || '—'}</div>
            <div className="lg-pill p3 blur"><span><Wallet size={13} /></span>Compliant visits earn ₹50</div>
          </div>

          <div className="lg-facts">
            {FACTS.map(([v, l]) => (
              <div key={l}><b>{v}</b><span>{l}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT: role selection */}
      <section className="lg-form">
        <header className="lg-header sp-header-actions">
          <button type="button" onClick={() => nav('/')}><T>Back</T></button>
          <LanguagePicker />
        </header>

        <form className="lg-box" onSubmit={submit}>
          <h2><T>Welcome to SightPay</T></h2>
          <p className="lg-sub"><T>Choose your workspace</T></p>

          <div className="lg-ws" role="radiogroup" aria-label="Role">
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
                    <span className="lg-wtag">{t(tag)}</span>
                    <strong>{t(title)}</strong>
                    <small>{t(text)}</small>
                  </span>
                  <span className="lg-radio">{on && <Check size={13} strokeWidth={3} />}</span>
                </button>
              )
            })}
          </div>

          {sel === 'fse' ? (
            <div className="lg-field">
              <span>Who are you?</span>
              {repsError && <div className="lg-err" role="alert">Cannot load reps: {repsError.message}</div>}
              {!reps && !repsError && <small className="lg-hint">Loading field reps…</small>}
              {reps && reps.length === 0 && <small className="lg-hint">No field reps in the backend yet.</small>}
              {reps && reps.length > 0 && (
                <div className="lg-ws lg-reps" role="radiogroup" aria-label="Field rep">
                  {reps.map((r) => {
                    const on = Number(fseId) === r.id
                    return (
                      <button
                        type="button"
                        key={r.id}
                        role="radio"
                        aria-checked={on}
                        className={`lg-wcard ${on ? 'on' : ''}`}
                        onClick={() => setFseId(r.id)}
                      >
                        <span className="lg-wico"><UserRound size={18} strokeWidth={1.8} /></span>
                        <span className="lg-wtxt">
                          <strong>{r.name}</strong>
                          <small>FSE-{r.id} · {r.territory || '—'}</small>
                        </span>
                        <span className="lg-radio">{on && <Check size={13} strokeWidth={3} />}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <label className="lg-field">
              <span><T>Your name (recorded as the approver)</T></span>
              <input
                value={managerName}
                onChange={(e) => setManagerNameInput(e.target.value)}
                placeholder="e.g. Priya Kulkarni"
                autoComplete="name"
                aria-label="Manager name"
              />
            </label>
          )}

          {formError && <div className="lg-err" role="alert">{formError}</div>}

          <button type="submit" className="lg-go">
            {t(ws.cta)} <ArrowRight size={16} />
          </button>

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

/* role details (reuse the workspace-card look) */
.lg-field{display:grid;gap:8px;margin-top:18px}
.lg-field > span{font-size:12px;font-weight:600;color:var(--ink2)}
.lg-field input{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:#FFFFFF;color:var(--ink);font:400 14px Inter,sans-serif;outline:0}
.lg-field input:focus{border-color:#1F5BFF}
.lg-reps{margin-top:0;gap:8px}
.lg-reps .lg-wcard{padding:10px 14px}
.lg-reps .lg-wico{width:34px;height:34px;border-radius:11px}
.lg-hint{font-size:12px;color:var(--ink2)}
.lg-err{margin-top:10px;padding:10px 12px;border-radius:12px;background:#FEE2E2;color:#DC2626;font-size:12.5px}

@media (max-width:900px){
  .lg{grid-template-columns:1fr}
  .lg-hero-in{min-height:0}
  .lg-pill{display:none}
}
`