import { T, LanguagePicker } from '../components/Language'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Camera,
  Check,
  Database,
  Fingerprint,
  Languages,
  MapPin,
  MessageCircle,
  Mic,
  Scan,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
  Brain,
  X,
} from 'lucide-react'

/* ============================================================
   CONTENT (from the SightPay project overview)
   ============================================================ */

const CAPABILITIES = [
  [Scan, 'Counter photo scoring'],
  [MapPin, 'GPS check within 100 m'],
  [Fingerprint, 'Photo reuse detection'],
  [ShieldCheck, 'Competitor sticker check'],
  [Wallet, 'Automatic incentive payout'],
  [MessageCircle, 'WhatsApp nudges'],
  [Mic, 'Voice notes in local languages'],
  [Brain, 'Merchant memory graph'],
  [TrendingUp, 'Daily uplift tracking'],
  [Users, 'Re-visits only when needed'],
]

const DECISIONS = [
  ['ok', 'Sharma Kirana', 'Score 82, incentive paid'],
  ['fix', 'Gupta Mobile', 'Score 54, fix steps sent to rep'],
  ['msg', 'Lakshmi Stores', 'Nudge sent in Tamil, with voice note'],
  ['esc', 'Blurry counter photo', 'Low confidence, sent to area manager'],
  ['block', 'Reused photo hash', 'Payout blocked and escalated'],
  ['up', 'Patil Traders', '+19% transactions after the visit'],
  ['esc', 'Payout above ₹100', 'Waiting for manager approval'],
]

const STEPS = [
  [Camera, 'Capture', 'Rep app', 'The rep takes a photo. GPS, time and merchant ID are captured with it.'],
  [ShieldCheck, 'Verify', 'n8n', 'GPS within 100 m, a live camera photo, and an image hash to catch reused photos.'],
  [Scan, 'Score', 'Vision model', 'The counter is scored out of 100 for QR, Soundbox and competitors, with a confidence value and fix steps.'],
  [Brain, 'Recall', 'Cognee', 'The agent pulls the merchant’s history: past issues, competitors and whether the last fix worked.'],
  [Workflow, 'Decide', 'Decision rules', 'Clear rules choose the action. Normal cases stay with the AI, risky ones go to people.'],
  [MessageCircle, 'Act', 'n8n and Sarvam', 'Pay the incentive, instruct the rep, message the merchant in their language, or escalate.'],
  [Database, 'Remember', 'Cognee', 'The visit, score, reply and result are saved as a connected graph for next time.'],
  [TrendingUp, 'Prove', 'Daily workflow', 'Transactions are compared with the baseline. If volume drops, a re-visit is triggered.'],
]

const SCORE_PARTS = [
  ['Paytm QR present and fully visible', 40],
  ['QR placed near billing point', 20],
  ['Soundbox present', 20],
  ['Paytm more prominent than competitors', 20],
]

const RULES = [
  ['ok', 'Score 75 or above, genuine visit', 'Pay incentive automatically'],
  ['mid', 'Score below 75', 'Fix steps to rep, WhatsApp nudge, retake'],
  ['mid', 'Low confidence', 'Escalate to area manager'],
  ['hi', 'Fraud signal', 'Block payout and escalate'],
  ['mid', 'Payout above ₹100', 'Manager approval needed'],
]

const WORKFLOWS = [
  ['Visit', ['Webhook', 'Score', 'Rules', 'Pay, message or escalate']],
  ['Merchant reply', ['WhatsApp', 'Sarvam', 'Agent', 'Ticket or rep']],
  ['Daily impact', ['Schedule', 'Uplift', 'Memory', 'Re-visit']],
]

/* [columns, rows, tone] — dense auto-placement packs these into a bento grid */
const TILES = [
  [3, 2, 1], [2, 1, 0], [2, 2, 0], [1, 1, 2], [4, 2, 0], [2, 1, 1], [1, 2, 0], [3, 1, 0],
  [2, 2, 1], [1, 1, 0], [2, 1, 2], [3, 2, 0], [1, 1, 1], [2, 1, 0], [4, 1, 0], [2, 2, 0],
  [1, 2, 1], [3, 1, 1], [2, 1, 0], [1, 1, 0], [2, 2, 2], [3, 1, 0], [1, 1, 0], [2, 1, 1],
  [3, 2, 0], [1, 1, 0], [2, 1, 0], [1, 2, 0], [2, 1, 1], [4, 1, 0], [1, 1, 0], [1, 1, 1],
  [1, 1, 0], [2, 1, 0], [1, 1, 0], [1, 1, 2], [1, 1, 0], [1, 1, 0], [2, 1, 0], [1, 1, 0],
]

/* ============================================================
   HOOKS
   ============================================================ */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useInView(threshold = 0.2) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return [ref, seen]
}

function useCountUp(target, run, ms = 1400) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!run) return
    if (prefersReducedMotion()) {
      setValue(target)
      return
    }
    let raf
    let start
    const tick = (t) => {
      if (start === undefined) start = t
      const p = Math.min((t - start) / ms, 1)
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, ms])

  return value
}

/* ============================================================
   SMALL PIECES
   ============================================================ */

function Reveal({ as: Tag = 'div', delay = 0, className = '', children }) {
  const [ref, seen] = useInView()
  return (
    <Tag ref={ref} className={`lp-rv ${seen ? 'in' : ''} ${className}`} style={{ '--dl': `${delay}ms` }}>
      {children}
    </Tag>
  )
}

/* Bento tile: reveals on scroll and lights its border under the cursor */
function Tile({ className = '', delay = 0, children }) {
  const [ref, seen] = useInView(0.15)

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--tx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--ty', `${e.clientY - r.top}px`)
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`lp-tile lp-rv ${seen ? 'in' : ''} ${className}`}
      style={{ '--dl': `${delay}ms` }}
    >
      {typeof children === 'function' ? children(seen) : children}
    </div>
  )
}

function BentoLayer({ glow = false, dark = false }) {
  return (
    <div className={`lp-bento ${glow ? 'glow' : ''} ${dark ? 'dark' : ''}`} aria-hidden="true">
      {TILES.map(([c, r, t], i) => (
        <i key={i} className={`t${t}`} style={{ gridColumn: `span ${c}`, gridRow: `span ${r}`, '--i': i }} />
      ))}
    </div>
  )
}

function Logo() {
  return (
    <span className="lp-logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#1F5BFF" />
        <circle cx="16" cy="16" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="16" cy="16" r="2.2" fill="#fff" />
        <path d="M16 3.5v4M16 24.5v4M3.5 16h4M24.5 16h4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      SightPay
    </span>
  )
}

function Marquee({ children, reverse = false, seconds = 50 }) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <div className="lp-marq">
      <div className={`lp-track ${reverse ? 'rev' : ''}`} style={{ '--dur': `${seconds}s` }}>
        {[...items, ...items].map((item, i) => (
          <div className="lp-marq-item" key={i} aria-hidden={i >= items.length}>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================================================
   HERO VISUAL — live audit card
   ============================================================ */

const AUDIT = [
  ['Paytm QR fully visible', 40, 40],
  ['QR near billing point', 0, 20],
  ['Soundbox present', 20, 20],
  ['Paytm more prominent', 0, 20],
]

function AuditCard({ name }) {
  const score = useCountUp(60, true, 1800)
  const C = 2 * Math.PI * 46

  return (
    <div className="lp-audit">
      <div className="lp-audit-top">
        <span className="lp-live"><i />Live audit</span>
        <span className="lp-audit-name">{name}</span>
      </div>

      <div className="lp-audit-main">
        <svg viewBox="0 0 110 110" className="lp-ring" role="img" aria-label="Visibility score 60 out of 100">
          <circle cx="55" cy="55" r="46" fill="none" stroke="#E6EEFF" strokeWidth="9" />
          <circle
            cx="55" cy="55" r="46" fill="none" stroke="#1F5BFF" strokeWidth="9" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 55 55)"
          />
          <text x="55" y="56" textAnchor="middle" className="lp-ring-n">{score}</text>
          <text x="55" y="73" textAnchor="middle" className="lp-ring-s">of 100</text>
        </svg>

        <ul className="lp-audit-list">
          {AUDIT.map(([label, got, max], i) => (
            <li key={label}>
              <span className={`lp-tick ${got ? 'yes' : 'no'}`}>{got ? <Check size={11} /> : <X size={11} />}</span>
              <span className="lp-audit-l">{label}</span>
              <b>{got}/{max}</b>
              <em><u style={{ '--w': `${(got / max) * 100}%`, '--dl': `${900 + i * 140}ms` }} /></em>
            </li>
          ))}
        </ul>
      </div>

      <div className="lp-audit-meta">
        <div><span>AI confidence</span><b>93%</b></div>
        <div><span>Location</span><b className="ok"><ShieldCheck size={13} /> Verified</b></div>
        <div><span>Competitor</span><b>PhonePe, larger</b></div>
      </div>

      <div className="lp-audit-act">
        <span>Score is below 75</span>
        <b>Rep gets fix steps. Merchant gets a WhatsApp nudge.</b>
      </div>
    </div>
  )
}

/* ============================================================
   HOW IT WORKS — scroll-linked timeline
   ============================================================ */

function HowItWorks() {
  const wrap = useRef(null)
  const refs = useRef([])
  const [fill, setFill] = useState(0)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let raf = 0

    const calc = () => {
      raf = 0
      const el = wrap.current
      if (!el) return
      const line = window.innerHeight * 0.6
      const rect = el.getBoundingClientRect()
      setFill(Math.max(0, Math.min(line - rect.top, rect.height)))
      setActive(refs.current.filter((s) => s && s.getBoundingClientRect().top < line).length)
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(calc)
    }

    calc()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section className="lp-sec lp-how" id="how">
      <div className="lp-how-grid">
        <aside className="lp-how-side">
          <Reveal>
            <h2 className="lp-h2">From counter photo to measured uplift</h2>
            <p className="lp-p">
              Every visit follows the same eight steps. Scroll to follow one visit from the rep’s phone to the merchant’s
              transactions.
            </p>
          </Reveal>

          <ol className="lp-mini">
            {STEPS.map(([, title], i) => (
              <li key={title} className={i < active ? 'done' : ''}>
                <i />
                {title}
              </li>
            ))}
          </ol>
        </aside>

        <div className="lp-tl" ref={wrap}>
          <div className="lp-tl-line"><span style={{ height: fill }} /></div>

          {STEPS.map(([Icon, title, tool, text], i) => (
            <div
              key={title}
              ref={(el) => (refs.current[i] = el)}
              className={`lp-step ${i < active ? 'on' : ''}`}
            >
              <span className="lp-dot">{i + 1}</span>
              <div className="lp-step-card">
                <div className="lp-step-head">
                  <span className="lp-step-ico"><Icon size={18} strokeWidth={1.8} /></span>
                  <h3>{title}</h3>
                  <span className="lp-chip-tool">{tool}</span>
                </div>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   INTELLIGENCE STACK — bento grid
   ============================================================ */

function IntelligenceStack() {
  return (
    <section className="lp-sec" id="stack">
      <Reveal className="lp-head">
        <h2 className="lp-h2">Three layers, one agent</h2>
        <p className="lp-p">
          n8n acts, Sarvam speaks the merchant’s language, and Cognee remembers everything. A clear rulebook decides
          when a human steps in.
        </p>
      </Reveal>

      <div className="lp-bentogrid">
        {/* Scoring */}
        <Tile className="b-score" delay={0}>
          {(seen) => (
            <>
              <span className="lp-tag">Vision model</span>
              <h3>A 100-point score for every counter</h3>
              <p>Each photo returns a score, a confidence value and instructions to fix what is missing.</p>

              <div className="lp-stack-bar">
                {SCORE_PARTS.map(([label, pts], i) => (
                  <span key={label} className={`s${i}`} style={{ '--w': `${pts}%`, '--dl': `${300 + i * 140}ms` }}>
                    {pts}
                  </span>
                ))}
              </div>

              <ul className="lp-score-list">
                {SCORE_PARTS.map(([label, pts], i) => (
                  <li key={label}><i className={`s${i}`} />{label}<b>{pts} pts</b></li>
                ))}
              </ul>

              <div className="lp-note">
                A visible QR (40) away from billing (0), with a Soundbox (20) and a larger PhonePe sticker (0), scores
                <b> 60 / 100</b>.
              </div>
            </>
          )}
        </Tile>

        {/* n8n */}
        <Tile className="b-n8n" delay={90}>
          <span className="lp-tag">n8n · action layer</span>
          <h3>Three workflows run the operation</h3>
          <div className="lp-flows">
            {WORKFLOWS.map(([name, nodes]) => (
              <div className="lp-flow-row" key={name}>
                <b>{name}</b>
                <div className="lp-nodes">
                  {nodes.map((n, i) => (
                    <span key={n}>{n}{i < nodes.length - 1 && <ArrowRight size={11} />}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        {/* Sarvam */}
        <Tile className="b-sarvam" delay={180}>
          <span className="lp-tag">Sarvam AI · language layer</span>
          <h3>Merchants hear it in their own language</h3>
          <div className="lp-chat">
            <div className="lp-bubble out">
              अपना Paytm QR बिलिंग काउंटर के पास लगाइए।
              <small>WhatsApp nudge, Hindi</small>
            </div>
            <div className="lp-bubble in">
              <span className="lp-wave">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--k': i }} />)}</span>
              <small>Voice reply, transcribed and translated</small>
            </div>
          </div>
          <div className="lp-langs">Hindi · Marathi · Tamil and more, as text or voice</div>
        </Tile>

        {/* Cognee */}
        <Tile className="b-cognee" delay={0}>
          <span className="lp-tag">Cognee · memory layer</span>
          <h3>Every merchant, remembered</h3>
          <svg viewBox="0 0 260 140" className="lp-graph" role="img" aria-label="Merchant knowledge graph">
            {[[38, 34], [222, 34], [42, 108], [220, 108]].map(([x, y]) => (
              <line key={`${x}${y}`} x1="130" y1="70" x2={x} y2={y} className="lp-gline" />
            ))}
            <circle cx="130" cy="70" r="20" fill="#1F5BFF" />
            <text x="130" y="74" textAnchor="middle" className="lp-g-c"><T>Merchant</T></text>
            {[[38, 34, 'Rep'], [222, 34, 'Visits'], [42, 108, 'Issues'], [220, 108, 'Competitor']].map(([x, y, t]) => (
              <g key={t}>
                <circle cx={x} cy={y} r="14" fill="#fff" stroke="#1F5BFF" strokeWidth="1.8" />
                <text x={x} y={y + 28} textAnchor="middle" className="lp-g-l">{t}</text>
              </g>
            ))}
          </svg>
          <div className="lp-note">“Did the last fix actually improve volume?”</div>
        </Tile>

        {/* Rules */}
        <Tile className="b-rules" delay={90}>
          <span className="lp-tag">Decision rules</span>
          <h3>AI handles the normal. People get the risky.</h3>
          <ul className="lp-rules">
            {RULES.map(([tone, when, then]) => (
              <li key={when}>
                <span>{when}</span>
                <b className={tone}>{then}</b>
              </li>
            ))}
          </ul>
        </Tile>

        {/* Impact */}
        <Tile className="b-impact" delay={180}>
          {(seen) => <Impact seen={seen} />}
        </Tile>
      </div>
    </section>
  )
}

function Impact({ seen }) {
  const n = useCountUp(19, seen, 1600)
  return (
    <>
      <span className="lp-tag">Daily impact workflow</span>
      <h3>Proof, not promises</h3>
      <div className="lp-big">+{n}%</div>
      <p>Transactions after the visit, compared with the merchant’s own baseline.</p>
      <svg viewBox="0 0 260 80" className="lp-spark" aria-hidden="true">
        <line x1="0" y1="56" x2="260" y2="56" stroke="#B9CDF7" strokeDasharray="4 4" />
        <line x1="110" y1="8" x2="110" y2="72" stroke="#C7D8FF" />
        <path
          d="M0 58L20 54L40 60L60 56L80 59L110 56L140 48L170 36L200 30L230 22L256 14"
          pathLength="1" className="lp-spark-line" fill="none" stroke="#1F5BFF" strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx="110" cy="56" r="4" fill="#fff" stroke="#1F5BFF" strokeWidth="2" />
      </svg>
    </>
  )
}

/* ============================================================
   PAGE
   ============================================================ */

export default function Landing() {
  const nav = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const merchantName = 'Ramesh General Store' // illustration only (seed merchant #1)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const onHeroMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div className="lp">
      <style>{CSS}</style>

      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <Logo />
        <nav>
          <a href="#product" onClick={(e) => { e.preventDefault(); go('product') }}><T>Product</T></a>
          <a href="#how" onClick={(e) => { e.preventDefault(); go('how') }}><T>How it works</T></a>
          <a href="#stack" onClick={(e) => { e.preventDefault(); go('stack') }}><T>AI stack</T></a>
          <a href="/login?role=manager" onClick={(e) => { e.preventDefault(); nav('/login?role=manager') }}><T>For managers</T></a>
        </nav>
        <div className="lp-nav-cta">
          <LanguagePicker />
          <button className="lp-btn ghost" onClick={() => nav('/login')}><T>Sign in</T></button>
          <button className="lp-btn primary" onClick={() => nav('/login')}><T>Launch SightPay</T></button>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero" id="product" onPointerMove={onHeroMove}>
        <div className="lp-blob a" />
        <div className="lp-blob b" />
        <div className="lp-blob c" />
        <div className="lp-swirl" />
        <div className="lp-grid" aria-hidden="true" />
        <div className="lp-grid glow" aria-hidden="true" />

        <div className="lp-hero-in">
          <div className="lp-hero-copy">
            <h1><T>Turn every field visit into measurable impact.</T></h1>
            <p className="lp-lead">
              SightPay gives field teams the intelligence to see what is happening at the merchant counter, verify the
              visit, act on the right intervention, and measure what changed.
            </p>
            <div className="lp-cta-row">
              <button className="lp-btn primary lg" onClick={() => nav('/login')}>
                <T>Explore SightPay</T> <ArrowRight size={16} />
              </button>
              <button className="lp-btn lg" onClick={() => nav('/login?role=fse')}><T>View field dashboard</T></button>
            </div>

            <div className="lp-stats">
              {[
                ['100 m', 'GPS check radius'],
                ['75+', 'Score that auto-pays'],
                ['0–100', 'Counter visibility score'],
                ['+19%', 'Observed uplift'],
              ].map(([value, label]) => (
                <div className="lp-stat" key={label}>
                  <b>{value}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-hero-vis">
            <div className="lp-halo" />
            <AuditCard name={merchantName} />
            <div className="lp-fchip c1"><span className="lp-fbadge"><ShieldCheck size={14} /></span>Visit verified</div>
            <div className="lp-fchip c2"><span className="lp-fbadge"><Scan size={13} /></span>AI audit complete</div>
            <div className="lp-fchip c3"><span className="lp-fbadge"><Languages size={14} /></span>Guidance ready in Hindi</div>
            <div className="lp-fchip c4 solid"><span className="lp-fbadge"><TrendingUp size={14} /></span>+19% observed</div>
            <div className="lp-fchip c5 blur"><span className="lp-fbadge"><Wallet size={14} /></span>Incentive paid</div>
          </div>
        </div>
      </section>

      {/* INFINITE CAROUSELS */}
      <section className="lp-carousels" aria-label="What SightPay does on every visit">
        <Marquee seconds={46}>
          {CAPABILITIES.map(([Icon, label]) => (
            <span className="lp-cap" key={label}><Icon size={16} strokeWidth={1.9} />{label}</span>
          ))}
        </Marquee>

        <Marquee reverse seconds={62}>
          {DECISIONS.map(([kind, title, meta]) => (
            <div className={`lp-dec ${kind}`} key={title + meta}>
              <i />
              <div><b>{title}</b><span>{meta}</span></div>
            </div>
          ))}
        </Marquee>
        <p className="lp-foot-note">Sample decisions, for illustration.</p>
      </section>

      <HowItWorks />
      <IntelligenceStack />

      {/* CTA */}
      <section className="lp-cta">
        <BentoLayer dark />
        <Reveal className="lp-cta-in">
          <h2>From field activity to field intelligence.</h2>
          <p>SightPay connects every visit, decision and intervention into one operational feedback loop.</p>
          <div className="lp-cta-row center">
            <button className="lp-btn light lg" onClick={() => nav('/login')}>
              <T>Enter SightPay</T> <ArrowRight size={16} />
            </button>
            <button className="lp-btn outline lg" onClick={() => nav('/login?role=manager')}><T>For managers</T></button>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <Logo />
        <span>AI field operations for Paytm.</span>
      </footer>
    </div>
  )
}

/* ============================================================
   STYLES
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@500;600;700&display=swap');

.lp{
  --ink:#0A1B3D; --ink2:#5B6E96; --line:#DDE7FB; --blue:#1F5BFF; --navy:#0B2A8A; --sky:#9CC0FF; --mist:#EEF3FF;
  min-height:100vh; background:#fff; color:var(--ink); font-family:Inter,system-ui,sans-serif; overflow-x:clip;
  scroll-behavior:smooth;
}
.lp *{box-sizing:border-box}
.lp h1,.lp h2,.lp h3{font-family:Sora,Inter,sans-serif;letter-spacing:-.025em;margin:0}
.lp p{margin:0}
.lp :focus-visible{outline:2px solid var(--blue);outline-offset:3px}

/* ---------- buttons ---------- */
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 18px;border-radius:12px;cursor:pointer;
  font:600 14px Inter,sans-serif;color:var(--navy);background:#fff;border:1px solid var(--line);transition:.18s}
.lp-btn:hover{border-color:var(--blue);color:var(--blue)}
.lp-btn.lg{padding:14px 24px;font-size:15px;border-radius:14px}
.lp-btn.ghost{border-color:transparent;background:transparent}
.lp-btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 12px 24px -12px rgba(31,91,255,.75)}
.lp-btn.primary:hover{background:var(--navy);border-color:var(--navy);color:#fff}
.lp-btn.light{background:#fff;color:var(--navy);border-color:#fff}
.lp-btn.light:hover{background:var(--mist);color:var(--navy)}
.lp-btn.outline{background:transparent;color:#fff;border-color:rgba(255,255,255,.4)}
.lp-btn.outline:hover{background:rgba(255,255,255,.12);color:#fff;border-color:#fff}

/* ---------- nav (floating pill) ---------- */
.lp-nav{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:50;width:min(1120px,calc(100% - 32px));display:flex;align-items:center;gap:20px;
  padding:9px 10px 9px 22px;border-radius:999px;background:rgba(255,255,255,.82);border:1px solid rgba(255,255,255,.95);backdrop-filter:blur(16px);
  box-shadow:0 0 0 1px rgba(196,212,250,.55),0 14px 34px -22px rgba(31,91,255,.35);transition:box-shadow .25s,background .25s}
.lp-nav.scrolled{background:rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(196,212,250,.85),0 18px 40px -20px rgba(31,91,255,.45)}
.lp-nav nav{display:flex;gap:30px;margin:0 auto}
.lp-nav nav a{color:var(--ink2);font-size:14px;font-weight:500;text-decoration:none;cursor:pointer;transition:color .15s}
.lp-nav nav a:hover{color:var(--blue)}
.lp-nav-cta{display:flex;gap:6px}
.lp-nav .lp-btn{border-radius:999px;padding:9px 18px;font-size:13.5px}
.lp-logo{display:inline-flex;align-items:center;gap:9px;font:700 18px Sora,sans-serif;letter-spacing:-.03em;color:var(--ink)}

/* ---------- bento background ---------- */
.lp-bento{position:absolute;inset:0;display:grid;grid-template-columns:repeat(14,1fr);grid-template-rows:repeat(7,1fr);grid-auto-rows:0;
  grid-auto-flow:row dense;gap:10px;padding:10px;overflow:hidden;pointer-events:none;
  -webkit-mask-image:radial-gradient(ellipse 95% 90% at 62% 40%,#000 30%,transparent 100%);
  mask-image:radial-gradient(ellipse 95% 90% at 62% 40%,#000 30%,transparent 100%)}
.lp-bento i{border-radius:16px;border:1px solid #DCE6FB;background:#fff}
.lp-bento i.t1{background:#F3F7FF}
.lp-bento i.t2{background:linear-gradient(135deg,#E8F0FF,#D3E2FF);animation:lpLit 6s ease-in-out infinite;animation-delay:calc(var(--i)*.45s)}
.lp-bento.glow{-webkit-mask-image:radial-gradient(240px circle at var(--mx,62%) var(--my,35%),#000,transparent 72%);
  mask-image:radial-gradient(240px circle at var(--mx,62%) var(--my,35%),#000,transparent 72%)}
.lp-bento.glow i{background:transparent;border-color:rgba(31,91,255,.6);animation:none}
.lp-bento.dark{-webkit-mask-image:none;mask-image:none}
.lp-bento.dark i{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.16)}
.lp-bento.dark i.t1{background:rgba(255,255,255,.09)}
.lp-bento.dark i.t2{background:rgba(255,255,255,.16);animation:none}

/* ---------- hero: soft gradient + square grid ---------- */
.lp-hero{position:relative;margin:14px;border-radius:34px;padding:168px clamp(24px,6vw,84px) 96px;overflow:hidden;isolation:isolate;
  background:
    radial-gradient(560px 380px at 100% 100%,rgba(150,215,245,.55),transparent 70%),
    radial-gradient(620px 420px at 46% 112%,rgba(185,180,247,.5),transparent 70%),
    linear-gradient(160deg,#E2EAFF 0%,#F5F8FF 50%,#EAF5FF 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.9),0 0 0 1px rgba(170,190,245,.55)}
.lp-blob{position:absolute;z-index:0;border-radius:50%;filter:blur(70px);pointer-events:none;animation:lpDrift 18s ease-in-out infinite}
.lp-blob.a{width:520px;height:420px;left:-140px;top:-120px;background:#8EC5FF;opacity:.85}
.lp-blob.b{width:460px;height:340px;left:8%;top:24%;background:#A6EBE6;opacity:.75;animation-delay:-6s}
.lp-blob.c{width:640px;height:420px;left:-120px;bottom:-210px;background:#B9B4F7;opacity:.85;animation-delay:-11s}
.lp-swirl{position:absolute;z-index:0;left:26%;top:14%;width:76%;height:114%;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,#fff 55%,rgba(255,255,255,0));filter:blur(22px);transform:rotate(-14deg)}

/* square grid: same origin on both layers so the cursor glow lines up with the base grid */
.lp-grid{position:absolute;inset:0;z-index:1;pointer-events:none;background-position:center top;background-size:84px 84px;
  background-image:linear-gradient(rgba(70,190,225,.4) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(70,190,225,.4) 1.5px,transparent 1.5px);
  -webkit-mask-image:radial-gradient(ellipse 34% 50% at 75% 46%,#000 30%,transparent 100%);
  mask-image:radial-gradient(ellipse 34% 50% at 75% 46%,#000 30%,transparent 100%)}
.lp-grid.glow{
  background-image:linear-gradient(rgba(31,91,255,.7) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(31,91,255,.7) 1.5px,transparent 1.5px);
  -webkit-mask-image:radial-gradient(220px circle at var(--mx,75%) var(--my,46%),#000,transparent 70%);
  mask-image:radial-gradient(220px circle at var(--mx,75%) var(--my,46%),#000,transparent 70%)}

.lp-hero-in{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;max-width:1240px;margin:0 auto}
.lp-hero h1{font:500 clamp(42px,5.6vw,72px)/1.06 Inter,system-ui,sans-serif;letter-spacing:-.04em;color:#050B1E;max-width:11em}
.lp-lead{margin-top:22px;max-width:44ch;font-size:16px;line-height:1.65;color:#4C5B7A}
.lp-cta-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.lp-cta-row.center{justify-content:center}
.lp-hero .lp-btn{border-radius:999px;padding:13px 26px;font-size:14.5px}
.lp-hero .lp-btn.primary{border:0;color:#fff;background:linear-gradient(180deg,#72A8FF 0%,#2F6BF0 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 14px 26px -12px rgba(47,107,240,.8)}
.lp-hero .lp-btn.primary:hover{background:linear-gradient(180deg,#5F9BFF 0%,#1F5BFF 100%);color:#fff}
.lp-hero .lp-btn:not(.primary){border:0;background:#fff;box-shadow:0 10px 24px -16px rgba(60,90,200,.55)}

.lp-stats{display:flex;flex-wrap:wrap;row-gap:22px;margin-top:54px}
.lp-stat{padding:2px 24px;border-left:1px solid rgba(120,130,230,.35)}
.lp-stat:first-child{padding-left:0;border-left:0}
.lp-stat b{display:block;font:500 clamp(24px,2.6vw,32px)/1 Inter,sans-serif;letter-spacing:-.03em;color:#050B1E}
.lp-stat span{display:block;margin-top:8px;font-size:11.5px;color:#4C5B7A}

.lp-hero-vis{position:relative;width:100%;max-width:520px;justify-self:end;padding:34px 0}
.lp-halo{position:absolute;inset:14% -4% 0;background:radial-gradient(closest-side,rgba(120,150,255,.28),transparent);filter:blur(30px)}

.lp-audit{position:relative;z-index:2;background:rgba(255,255,255,.66);border:1px solid rgba(255,255,255,.95);border-radius:26px;padding:20px;
  box-shadow:0 40px 80px -44px rgba(70,90,220,.6),inset 0 1px 0 rgba(255,255,255,.9);backdrop-filter:blur(20px)}
.lp-audit-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lp-live{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;background:var(--mist);color:var(--blue);font-size:11.5px;font-weight:600}
.lp-live i{width:6px;height:6px;border-radius:50%;background:var(--blue);animation:lpBlink 1.8s infinite}
.lp-audit-name{font:600 14px Sora,sans-serif;color:var(--ink)}
.lp-audit-main{display:grid;grid-template-columns:118px 1fr;gap:18px;align-items:center;margin:18px 0}
.lp-ring{width:118px;height:118px}
.lp-ring-n{font:700 30px Sora,sans-serif;fill:var(--ink)}
.lp-ring-s{font:500 10px Inter,sans-serif;fill:var(--ink2)}
.lp-audit-list{list-style:none;margin:0;padding:0;display:grid;gap:11px}
.lp-audit-list li{display:grid;grid-template-columns:18px 1fr auto;gap:2px 9px;align-items:center;font-size:12.5px}
.lp-audit-list b{font:600 12px Inter,sans-serif;color:var(--ink)}
.lp-audit-list em{grid-column:2/4;height:4px;border-radius:9px;background:var(--mist);overflow:hidden}
.lp-audit-list u{display:block;height:100%;border-radius:9px;background:var(--blue);width:0;animation:lpGrow 1s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:var(--dl)}
.lp-audit-l{color:var(--ink2)}
.lp-tick{width:18px;height:18px;border-radius:50%;display:grid;place-items:center}
.lp-tick.yes{background:var(--blue);color:#fff}
.lp-tick.no{background:var(--mist);color:var(--navy)}
.lp-audit-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.lp-audit-meta div{padding:10px 11px;border-radius:12px;background:var(--mist)}
.lp-audit-meta span{display:block;font-size:10.5px;color:var(--ink2)}
.lp-audit-meta b{display:flex;align-items:center;gap:4px;margin-top:3px;font:600 12.5px Inter,sans-serif;color:var(--ink)}
.lp-audit-meta b.ok{color:var(--blue)}
.lp-audit-act{margin-top:10px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#2A67FF,#0B2A8A);color:#fff}
.lp-audit-act span{display:block;font-size:10.5px;opacity:.75}
.lp-audit-act b{display:block;margin-top:3px;font:600 13px Inter,sans-serif;line-height:1.4}

.lp-fchip{position:absolute;z-index:3;display:flex;align-items:center;gap:9px;padding:6px 15px 6px 6px;border-radius:999px;background:rgba(255,255,255,.94);
  font:500 12.5px Inter,sans-serif;color:var(--ink);white-space:nowrap;box-shadow:0 16px 32px -16px rgba(60,80,210,.5);animation:lpBob 6s ease-in-out infinite}
.lp-fbadge{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#7FB0FF,#5D5BE6)}
.lp-fchip.solid .lp-fbadge{background:linear-gradient(135deg,#59D7E6,#2F6BF0)}
.lp-fchip.blur{filter:blur(2.2px);opacity:.92}
.lp-fchip.c1{top:-4px;left:-6%}
.lp-fchip.c2{top:78px;right:-5%;animation-delay:-1.5s;font-size:11.5px}
.lp-fchip.c3{bottom:66px;left:-11%;animation-delay:-3s}
.lp-fchip.c4{bottom:-6px;right:4%;animation-delay:-4.5s;font-size:14px}
.lp-fchip.c5{top:-14px;right:16%;animation-delay:-2.2s;font-size:14px}

/* ---------- carousels ---------- */
.lp-carousels{padding:34px 0 22px;display:grid;gap:14px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff}
.lp-marq{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}
.lp-track{display:flex;width:max-content;animation:lpMarq var(--dur,50s) linear infinite}
.lp-track.rev{animation-direction:reverse}
.lp-marq:hover .lp-track{animation-play-state:paused}
.lp-marq-item{flex:none;margin-right:14px}
.lp-cap{display:inline-flex;align-items:center;gap:9px;padding:11px 18px;border-radius:99px;background:var(--mist);color:var(--navy);
  border:1px solid var(--line);font:500 14px Inter,sans-serif;white-space:nowrap}
.lp-cap svg{color:var(--blue)}
.lp-dec{display:flex;align-items:center;gap:12px;min-width:250px;padding:12px 16px;border-radius:14px;background:#fff;border:1px solid var(--line);
  box-shadow:0 10px 24px -20px rgba(11,42,138,.5)}
.lp-dec i{width:9px;height:9px;flex:none;border-radius:50%;background:var(--blue);box-shadow:0 0 0 4px rgba(31,91,255,.14)}
.lp-dec.fix i,.lp-dec.msg i{background:var(--sky);box-shadow:0 0 0 4px rgba(156,192,255,.3)}
.lp-dec.esc i{background:#fff;border:2px solid var(--blue);box-shadow:none}
.lp-dec.block i{background:var(--navy);box-shadow:0 0 0 4px rgba(11,42,138,.15)}
.lp-dec b{display:block;font:600 13px Inter,sans-serif;color:var(--ink);white-space:nowrap}
.lp-dec span{display:block;margin-top:2px;font-size:12px;color:var(--ink2);white-space:nowrap}
.lp-foot-note{text-align:center;font-size:11.5px;color:var(--ink2);margin-top:2px}

/* ---------- sections ---------- */
.lp-sec{padding:110px max(24px,calc((100vw - 1200px)/2))}
.lp-head{max-width:640px;margin-bottom:44px}
.lp-h2{font-size:clamp(28px,3.6vw,44px);line-height:1.1;font-weight:700}
.lp-p{margin-top:16px;font-size:16px;line-height:1.65;color:var(--ink2);max-width:56ch}

/* reveal */
.lp-rv{opacity:0;transform:translateY(22px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1);transition-delay:var(--dl,0ms)}
.lp-rv.in{opacity:1;transform:none}

/* ---------- how it works ---------- */
.lp-how{background:linear-gradient(180deg,#fff,#F5F8FF 40%,#fff)}
.lp-how-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:70px;align-items:start}
.lp-how-side{position:sticky;top:110px}
.lp-mini{list-style:none;margin:32px 0 0;padding:0;display:grid;gap:10px}
.lp-mini li{display:flex;align-items:center;gap:12px;font-size:14px;font-weight:500;color:#93A3C4;transition:color .3s}
.lp-mini li i{width:18px;height:18px;border-radius:50%;border:2px solid #C9D7F5;transition:.3s}
.lp-mini li.done{color:var(--ink)}
.lp-mini li.done i{background:var(--blue);border-color:var(--blue);box-shadow:0 0 0 4px rgba(31,91,255,.16)}
.lp-tl{position:relative;display:grid;gap:22px;padding-left:64px}
.lp-tl-line{position:absolute;left:19px;top:20px;bottom:20px;width:2px;background:var(--line);border-radius:2px}
.lp-tl-line span{display:block;width:100%;background:linear-gradient(180deg,#5B8DFF,#1F5BFF);border-radius:2px;max-height:100%}
.lp-step{position:relative;opacity:.4;transform:translateX(10px);transition:opacity .45s,transform .45s}
.lp-step.on{opacity:1;transform:none}
.lp-dot{position:absolute;left:-64px;top:14px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#fff;border:2px solid var(--line);
  font:700 14px Sora,sans-serif;color:#93A3C4;transition:.35s}
.lp-step.on .lp-dot{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 0 0 6px rgba(31,91,255,.14)}
.lp-step-card{padding:22px 24px;border-radius:18px;background:#fff;border:1px solid var(--line);transition:border-color .35s,box-shadow .35s}
.lp-step.on .lp-step-card{border-color:#B7CBFA;box-shadow:0 22px 40px -28px rgba(31,91,255,.5)}
.lp-step-head{display:flex;align-items:center;gap:12px}
.lp-step-head h3{font-size:18px}
.lp-step-ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--mist);color:var(--blue)}
.lp-chip-tool{margin-left:auto;padding:4px 10px;border-radius:99px;background:var(--mist);color:var(--navy);font-size:11.5px;font-weight:600}
.lp-step-card p{margin-top:10px;font-size:14.5px;line-height:1.6;color:var(--ink2)}

/* ---------- bento stack ---------- */
.lp-bentogrid{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.b-score{grid-column:1/4;grid-row:1/3}
.b-n8n{grid-column:4/7}
.b-sarvam{grid-column:4/7}
.b-cognee,.b-rules,.b-impact{grid-column:span 2}
.lp-tile{position:relative;padding:26px;border-radius:22px;background:#fff;border:1px solid var(--line);overflow:hidden;
  box-shadow:0 1px 2px rgba(11,42,138,.04)}
.lp-tile::before{content:'';position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity .25s;pointer-events:none;
  background:radial-gradient(320px circle at var(--tx,50%) var(--ty,50%),rgba(31,91,255,.10),transparent 70%)}
.lp-tile:hover::before{opacity:1}
.lp-tile:hover{border-color:#B7CBFA}
.lp-tile h3{font-size:19px;line-height:1.25;margin-top:12px}
.lp-tile > p{margin-top:8px;font-size:14px;line-height:1.55;color:var(--ink2)}
.lp-tag{display:inline-block;padding:4px 10px;border-radius:99px;background:var(--mist);color:var(--blue);font-size:11.5px;font-weight:600}

.lp-stack-bar{display:flex;gap:4px;margin-top:22px;height:38px}
.lp-stack-bar span{display:grid;place-items:center;width:0;border-radius:10px;font:700 13px Sora,sans-serif;color:#fff;overflow:hidden;
  transition:width 1s cubic-bezier(.2,.7,.2,1);transition-delay:var(--dl,0ms)}
.in .lp-stack-bar span{width:var(--w)}
.s0{background:var(--blue)} .s1{background:#4A86FF} .s2{background:#7AA5FF;color:var(--navy)!important} .s3{background:var(--navy)}
.lp-score-list{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:9px}
.lp-score-list li{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--ink2)}
.lp-score-list li i{width:10px;height:10px;border-radius:3px;flex:none}
.lp-score-list b{margin-left:auto;color:var(--ink);font-weight:600}
.lp-note{margin-top:20px;padding:13px 15px;border-radius:12px;background:var(--mist);font-size:13px;line-height:1.55;color:var(--ink2)}
.lp-note b{color:var(--blue)}

.lp-flows{display:grid;gap:12px;margin-top:18px}
.lp-flow-row{padding:12px 14px;border-radius:14px;background:#F6F9FF;border:1px solid var(--line)}
.lp-flow-row b{font:600 13px Inter,sans-serif;color:var(--ink)}
.lp-nodes{display:flex;flex-wrap:wrap;gap:6px 4px;margin-top:8px}
.lp-nodes span{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:8px;background:#fff;border:1px solid var(--line);font-size:11.5px;font-weight:500;color:var(--navy)}
.lp-nodes span svg{color:var(--blue)}

.lp-chat{display:grid;gap:10px;margin-top:18px}
.lp-bubble{max-width:88%;padding:11px 14px;border-radius:16px;font-size:14px;line-height:1.5}
.lp-bubble small{display:block;margin-top:5px;font-size:10.5px;opacity:.7}
.lp-bubble.out{background:var(--blue);color:#fff;border-bottom-left-radius:4px}
.lp-bubble.in{justify-self:end;background:var(--mist);color:var(--ink);border-bottom-right-radius:4px}
.lp-wave{display:flex;align-items:center;gap:3px;height:22px}
.lp-wave i{width:3px;border-radius:2px;background:var(--blue);height:calc(6px + (var(--k)*7 % 15)*1px);animation:lpWave 1.3s ease-in-out infinite;animation-delay:calc(var(--k)*.06s)}
.lp-langs{margin-top:14px;font-size:12.5px;color:var(--ink2)}

.lp-graph{width:100%;height:auto;margin-top:8px}
.lp-gline{stroke:#8FB0F7;stroke-width:1.6;stroke-dasharray:4 5;animation:lpDash 1.6s linear infinite}
.lp-g-c{font:600 7.5px Inter,sans-serif;fill:#fff}
.lp-g-l{font:500 9.5px Inter,sans-serif;fill:var(--ink2)}

.lp-rules{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:8px}
.lp-rules li{display:grid;gap:3px;padding:10px 12px;border-radius:12px;background:#F6F9FF;border:1px solid var(--line);font-size:12.5px;color:var(--ink2)}
.lp-rules b{font:600 12.5px Inter,sans-serif;color:var(--blue)}
.lp-rules b.hi{color:var(--navy)}
.lp-rules b.mid{color:#3A70F0}

.lp-big{margin-top:12px;font:700 56px/1 Sora,sans-serif;letter-spacing:-.04em;color:var(--blue)}
.lp-spark{width:100%;height:auto;margin-top:10px}
.lp-spark-line{stroke-dasharray:1;stroke-dashoffset:1}
.in .lp-spark-line{animation:lpDraw 1.6s cubic-bezier(.2,.7,.2,1) .3s forwards}

/* ---------- final CTA ---------- */
.lp-cta{position:relative;margin:0 max(16px,calc((100vw - 1200px)/2)) 90px;border-radius:32px;overflow:hidden;
  background:linear-gradient(135deg,#1F5BFF,#0B2A8A);padding:110px 32px;text-align:center}
.lp-cta .lp-bento{z-index:1}
.lp-cta-in{position:relative;z-index:2;max-width:720px;margin:0 auto}
.lp-cta h2{font-size:clamp(30px,4.4vw,52px);line-height:1.08;font-weight:700;color:#fff}
.lp-cta p{margin-top:18px;font-size:17px;line-height:1.6;color:rgba(255,255,255,.8)}
.lp-cta .lp-cta-row{margin-top:34px}

.lp-footer{display:flex;align-items:center;gap:16px;padding:0 max(24px,calc((100vw - 1200px)/2)) 46px;color:var(--ink2);font-size:13px}

/* ---------- motion ---------- */
@keyframes lpMarq{to{transform:translateX(-50%)}}
@keyframes lpDrift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(40px,24px,0) scale(1.08)}}
@keyframes lpBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes lpBlink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes lpLit{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes lpGrow{to{width:var(--w)}}
@keyframes lpDraw{to{stroke-dashoffset:0}}
@keyframes lpDash{to{stroke-dashoffset:-18}}
@keyframes lpWave{0%,100%{transform:scaleY(.55)}50%{transform:scaleY(1.15)}}

@media (prefers-reduced-motion:reduce){
  .lp{scroll-behavior:auto}
  .lp-track{animation:none}
  .lp-marq{overflow-x:auto}
  .lp-blob,.lp-fchip,.lp-live i,.lp-gline,.lp-wave i,.lp-bento i.t2{animation:none}
  .lp-rv{opacity:1;transform:none;transition:none}
  .lp-audit-list u{animation:none;width:var(--w)}
  .lp-stack-bar span{transition:none}
  .lp-spark-line{stroke-dashoffset:0;animation:none!important}
  .lp-step{opacity:1;transform:none}
}

/* ---------- responsive ---------- */
@media (max-width:1000px){
  .lp-nav nav{display:none}
  .lp-hero-in{grid-template-columns:1fr;gap:30px}
  .lp-hero h1{max-width:none}
  .lp-hero-vis{justify-self:center}
  .lp-how-grid{grid-template-columns:1fr;gap:36px}
  .lp-how-side{position:static}
  .lp-mini{display:none}
  .lp-bentogrid{grid-template-columns:1fr 1fr}
  .b-score{grid-column:1/3;grid-row:auto}
  .b-n8n,.b-sarvam,.b-cognee,.b-rules,.b-impact{grid-column:span 1}
}
@media (max-width:640px){
  .lp-sec{padding:80px 20px}
  .lp-hero{padding-top:120px}
  .lp-nav-cta .ghost{display:none}
  .lp-audit-main{grid-template-columns:1fr}
  .lp-ring{margin:0 auto}
  .lp-audit-meta{grid-template-columns:1fr}
  .lp-fchip{display:none}
  .lp-bentogrid{grid-template-columns:1fr}
  .b-score,.b-n8n,.b-sarvam,.b-cognee,.b-rules,.b-impact{grid-column:1}
  .lp-tl{padding-left:52px}
  .lp-dot{left:-52px;width:34px;height:34px}
  .lp-tl-line{left:16px}
  .lp-cta{padding:80px 20px;border-radius:24px}
}
`