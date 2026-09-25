import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Footprints,
  Languages,
  MapPin,
  Navigation,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Volume2,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react'
import { merchants } from '../data/demoData'
import { LogOut } from 'lucide-react'

export default function FseMobile() {
  const nav = useNavigate()
  const [screen, setScreen] = useState('M2')
  const [activeMerchant, setActiveMerchant] = useState(merchants[0])
  const [completedInterventions, setCompletedInterventions] = useState(5)
  const [isDone, setIsDone] = useState(false)

  const m = activeMerchant

  const handleStartVisit = (merchant) => {
    setActiveMerchant(merchant)
    setScreen('M4')
  }

  const handleCompleteIntervention = () => {
    setIsDone(true)
    setCompletedInterventions((prev) => prev + 1)
  }

  return (
    <div className="page-shell">
      {/* Header only — no sidebar on this page */}
      <header className="page-header-bar">
        <div className="header-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="28" height="28" rx="9" fill="#2F80C0" />
            <circle cx="16" cy="16" r="6.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
            <circle cx="16" cy="16" r="2.1" fill="#FFFFFF" />
          </svg>
          <span className="wordmark">SightPay</span>
        </div>
        <span className="header-sep">/</span>
        <span className="crumb">FSE Mobile Experience</span>
        <button className="header-logout" onClick={() => nav('/login')}>
    <LogOut size={13} />
    Log out
  </button>
      </header>

      <div className="mobile-exp-container">
        {/* Subheader banner */}
        <div className="mobile-exp-header card">
          <div>
            <span className="pill ev">Mobile Demonstration Layer</span>
            <h2>FSE Field Copilot Experience</h2>
            <p className="mu">
              Interactive simulation of the SightPay mobile application on the Field Sales Executive's phone.
            </p>
          </div>
          <div className="mobile-nav-buttons">
            <button
              className={`btn ${screen === 'M1' ? 'p' : ''}`}
              onClick={() => setScreen('M1')}
            >
              M1 Login
            </button>
            <button
              className={`btn ${screen === 'M2' ? 'p' : ''}`}
              onClick={() => setScreen('M2')}
            >
              M2 Home
            </button>
            <button
              className={`btn ${screen === 'M3' ? 'p' : ''}`}
              onClick={() => setScreen('M3')}
            >
              M3 Queue
            </button>
            <button
              className={`btn ${screen === 'M4' ? 'p' : ''}`}
              onClick={() => setScreen('M4')}
            >
              M4 Merchant
            </button>
            <button
              className={`btn ${screen === 'M5' ? 'p' : ''}`}
              onClick={() => setScreen('M5')}
            >
              M5 Audit
            </button>
            <button
              className={`btn ${screen === 'M6' ? 'p' : ''}`}
              onClick={() => setScreen('M6')}
            >
              M6 Action
            </button>
          </div>
        </div>

        {/* Smartphone Shell Frame */}
        <div className="phone-wrapper">
          <div className="phone-frame">
            {/* Phone Notch / Speaker */}
            <div className="phone-notch">
              <span className="notch-speaker" />
              <span className="notch-camera" />
            </div>

            {/* Phone Status Bar */}
            <div className="phone-status-bar">
              <span className="time">09:42 AM</span>
              <span className="network-icons">
                <span className="signal">5G</span>
                <span className="battery">88%</span>
              </span>
            </div>

            {/* Screen Content */}
            <div className="phone-screen">
              {/* M1: FSE LOGIN / IDENTITY */}
              {screen === 'M1' && (
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
                      <div className="m1-avatar">AS</div>
                      <div>
                        <h3>Aarav Sharma</h3>
                        <span className="mu sm">ID: SP-FSE-8042</span>
                      </div>
                    </div>
                    <div className="m1-details">
                      <div>
                        <span className="mu xs">ROLE</span>
                        <b>Field Sales Executive</b>
                      </div>
                      <div>
                        <span className="mu xs">REGION</span>
                        <b>Mumbai Central (Dadar Zone)</b>
                      </div>
                      <div>
                        <span className="mu xs">SECURITY</span>
                        <b className="lime">GPS + Biometric Synced</b>
                      </div>
                    </div>

                    <button
                      className="btn p m-full-btn"
                      onClick={() => setScreen('M2')}
                    >
                      ENTER FIELD WORKSPACE <ArrowRight size={16} />
                    </button>
                  </div>

                  <div className="m-foot-tag">
                    <ShieldCheck size={13} /> Secured by Paytm Field Engine
                  </div>
                </div>
              )}

              {/* M2: FSE HOME */}
              {screen === 'M2' && (
                <div className="m-screen m2-screen">
                  <div className="m-header">
                    <div>
                      <span className="mu xs">WELCOME BACK</span>
                      <h2>Good Morning, Aarav</h2>
                    </div>
                    <div className="m-avatar-sm" onClick={() => setScreen('M1')}>
                      AS
                    </div>
                  </div>

                  {/* Coverage KPIs */}
                  <div className="m2-kpis">
                    <div className="m2-kpi">
                      <b className="lime">17 / 24</b>
                      <span>VISITED (71%)</span>
                    </div>
                    <div className="m2-kpi">
                      <b>{completedInterventions}</b>
                      <span>INTERVENTIONS</span>
                    </div>
                    <div className="m2-kpi">
                      <b>18.4 km</b>
                      <span>TRAVELLED</span>
                    </div>
                  </div>

                  {/* Next Best Visit Highlight */}
                  <div className="m2-next-card">
                    <div className="m2-next-badge">
                      <Sparkles size={13} /> AI NEXT BEST VISIT
                    </div>
                    <h3>Ramesh General Store</h3>
                    <div className="m2-meta">
                      <span>
                        <MapPin size={12} /> 1.2 km away
                      </span>
                      <span className="pill HIGH">HIGH PRIORITY</span>
                    </div>

                    <div className="m2-reasons">
                      <div>
                        <i className="dot-lime" /> QR visibility score: <b>38/100</b>
                      </div>
                      <div>
                        <i className="dot-lime" /> Transactions declining: <b>↓12%</b>
                      </div>
                      <div>
                        <i className="dot-lime" /> Competitor dominance: <b>PhonePe HIGH</b>
                      </div>
                    </div>

                    <div className="m2-action-box">
                      <span className="mu xs">RECOMMENDED ACTION</span>
                      <b>Reposition Paytm QR closer to billing counter</b>
                    </div>

                    <button
                      className="btn p m-full-btn"
                      onClick={() => handleStartVisit(merchants[0])}
                    >
                      <Navigation size={15} /> START VISIT
                    </button>
                  </div>

                  {/* Priority Alerts */}
                  <div className="m2-alerts">
                    <div className="m2-alert-head">
                      <span>PRIORITY ALERTS</span>
                      <span
                        className="lnk"
                        onClick={() => setScreen('M3')}
                      >
                        Queue (5)
                      </span>
                    </div>
                    <div className="m2-alert-item">
                      <span className="pill HIGH">HIGH</span>
                      <div className="grow">
                        <b>PhonePe dominance detected</b>
                        <span className="mu sm">Ramesh General Store</span>
                      </div>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              )}

              {/* M3: AI PRIORITY QUEUE */}
              {screen === 'M3' && (
                <div className="m-screen m3-screen">
                  <div className="m-nav-head">
                    <button
                      className="m-back"
                      onClick={() => setScreen('M2')}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <h3>AI Priority Queue</h3>
                    <span className="pill ev">5 Merchants</span>
                  </div>

                  <p className="mu sm m-sub">
                    Ranked by SightPay Priority Score using QR visibility, transaction trend, competitor risk & distance.
                  </p>

                  <div className="m3-list">
                    {merchants.map((merchant, idx) => (
                      <div
                        className="m3-card"
                        key={merchant.id}
                        onClick={() => handleStartVisit(merchant)}
                      >
                        <div className="m3-top">
                          <span className="m3-rank">0{idx + 1}</span>
                          <div className="grow">
                            <h4>{merchant.name}</h4>
                            <span className="mu sm">
                              <MapPin size={11} /> {merchant.km} km · {merchant.location}
                            </span>
                          </div>
                          <div className="m3-score-ring">
                            <b>{merchant.score}</b>
                            <span className="mu xs">SCORE</span>
                          </div>
                        </div>

                        <div className="m3-tags">
                          <span className={`pill ${merchant.pri}`}>
                            {merchant.pri}
                          </span>
                          <span className="pill ev">
                            QR {merchant.qr}/100
                          </span>
                          <span className="pill ev">
                            {merchant.competitor}
                          </span>
                        </div>

                        <div className="m3-reason">
                          <span className="mu xs">REASON:</span>{' '}
                          {merchant.reasons?.[0] || 'Audit due'}
                        </div>

                        <div className="m3-cta">
                          <span>Action: <b>{merchant.action}</b></span>
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* M4: MERCHANT / VISIT */}
              {screen === 'M4' && (
                <div className="m-screen m4-screen">
                  <div className="m-nav-head">
                    <button
                      className="m-back"
                      onClick={() => setScreen('M3')}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <h3>Merchant Visit</h3>
                    <span className={`pill ${m.pri}`}>{m.pri}</span>
                  </div>

                  <div className="m4-card">
                    <h2>{m.name}</h2>
                    <p className="mu sm">
                      <MapPin size={12} /> {m.location}
                    </p>

                    <div className="m4-geofence">
                      <div className="m4-geo-icon">
                        <Compass size={18} color="#B7FF3C" />
                      </div>
                      <div>
                        <b>43m away</b> · <span className="lime">INSIDE 100m GEOFENCE</span>
                        <div className="mu xs">GPS CAPTURED (19.0178 N, 72.8478 E)</div>
                      </div>
                    </div>

                    <div className="m4-history">
                      <div>
                        <span className="mu xs">LAST VISIT</span>
                        <b>{m.last}</b>
                      </div>
                      <div>
                        <span className="mu xs">PREVIOUS ISSUE</span>
                        <b className="red">Poor QR visibility</b>
                      </div>
                      <div>
                        <span className="mu xs">QR SCORE</span>
                        <b>{m.qr} / 100</b>
                      </div>
                      <div>
                        <span className="mu xs">SOUNDBOX</span>
                        <b>{m.soundbox} / 100</b>
                      </div>
                    </div>

                    <button
                      className="btn p m-full-btn top16"
                      onClick={() => setScreen('M5')}
                    >
                      <Camera size={16} /> START AUDIT & CAPTURE
                    </button>
                  </div>
                </div>
              )}

              {/* M5: CAPTURE / AI AUDIT */}
              {screen === 'M5' && (
                <div className="m-screen m5-screen">
                  <div className="m-nav-head">
                    <button
                      className="m-back"
                      onClick={() => setScreen('M4')}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <h3>Capture Evidence</h3>
                    <span className="pill ev">AI Audit</span>
                  </div>

                  {/* Photo Evidence View */}
                  <div className="m5-photo-box">
                    <div className="m5-photo-overlay">
                      <span className="m5-tag">
                        <Camera size={12} /> COUNTER EVIDENCE CAPTURED
                      </span>
                      <span className="m5-tag lime-bg">
                        <Check size={12} /> HASH MATCHED
                      </span>
                    </div>

                    <div className="m5-evidence-unavailable">
                      <Camera size={32} color="#B7FF3C" />
                      <b>Merchant Counter Photo</b>
                      <span>GPS: 19.0178, 72.8478 | 09:42:03 AM</span>
                      <small className="mu">Evidence hash verified · No duplicate reuse</small>
                    </div>
                  </div>

                  {/* Vision AI Audit Signals */}
                  <div className="m5-signals">
                    <h4>Vision AI Analysis</h4>
                    <div className="m5-grid">
                      <div className="m5-stat">
                        <span>QR Visibility</span>
                        <b className="red">38 / 100</b>
                      </div>
                      <div className="m5-stat">
                        <span>QR Placement</span>
                        <b className="amb">Obstructed</b>
                      </div>
                      <div className="m5-stat">
                        <span>Soundbox</span>
                        <b className="lime">Visible (82/100)</b>
                      </div>
                      <div className="m5-stat">
                        <span>Competitor</span>
                        <b className="red">PhonePe HIGH</b>
                      </div>
                    </div>

                    <div className="m5-authenticity">
                      <ShieldCheck size={16} color="#B7FF3C" />
                      <div>
                        <b>Multi-Signal Authenticity: 94 / 100</b>
                        <span className="mu xs">GPS, Geofence, Time & Hash consistent</span>
                      </div>
                    </div>

                    <button
                      className="btn p m-full-btn top16"
                      onClick={() => setScreen('M6')}
                    >
                      <Sparkles size={16} /> GENERATE AI RECOMMENDATION
                    </button>
                  </div>
                </div>
              )}

              {/* M6: AI RESULT / RECOMMENDED ACTION */}
              {screen === 'M6' && (
                <div className="m-screen m6-screen">
                  <div className="m-nav-head">
                    <button
                      className="m-back"
                      onClick={() => setScreen('M5')}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <h3>AI Intervention</h3>
                    <span className="pill HIGH">93% Confidence</span>
                  </div>

                  <div className="m6-card">
                    <div className="m6-issue">
                      <span className="mu xs">DETECTED ISSUE</span>
                      <p>Paytm QR has poor visibility near billing counter. PhonePe is dominant.</p>
                    </div>

                    <div className="m6-recommendation">
                      <span className="mu xs">RECOMMENDED ACTION</span>
                      <h4>Reposition Paytm QR closer to the billing counter.</h4>
                    </div>

                    {/* Sarvam Language Guidance */}
                    <div className="m6-guidance">
                      <div className="m6-g-head">
                        <Languages size={14} color="#B7FF3C" />
                        <span>MERCHANT GUIDANCE (HINDI)</span>
                      </div>
                      <p className="m6-hindi">
                        “Paytm QR ko billing counter ke paas clearly visible jagah par rakhein.”
                      </p>
                      <div className="m6-audio-status">
                        <Volume2 size={14} /> Text guidance ready (Audio output logged)
                      </div>
                    </div>

                    {/* n8n Automation Status */}
                    <div className="m6-pipeline">
                      <span className="mu xs">EXECUTION PIPELINE</span>
                      <div className="m6-pipe-flow">
                        <span>Vision AI</span> → <span>Decision</span> → <span>n8n Switch</span> → <span>Sarvam</span>
                      </div>
                    </div>

                    <div className="m6-incentive">
                      <Wallet size={16} color="#B7FF3C" />
                      <div>
                        <b>Incentive Eligible: ₹50</b>
                        <span className="mu xs">Paid upon verified repositioning audit</span>
                      </div>
                    </div>

                    {!isDone ? (
                      <button
                        className="btn p m-full-btn top16"
                        onClick={handleCompleteIntervention}
                      >
                        <CheckCircle2 size={16} /> MARK INTERVENTION COMPLETE
                      </button>
                    ) : (
                      <div className="m6-done-box">
                        <CheckCircle2 size={24} color="#B7FF3C" />
                        <h3>Intervention Complete!</h3>
                        <p className="mu sm">
                          Merchant memory updated. Outcome will be tracked over next 14 days (+19% observed uplift expected).
                        </p>
                        <button
                          className="btn m-full-btn top16"
                          onClick={() => nav('/analytics')}
                        >
                          <TrendingUp size={15} /> VIEW IMPACT ANALYTICS
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Phone Bar */}
              <div className="phone-nav-bar">
                <button
                  className={`p-nav-item ${screen === 'M2' ? 'active' : ''}`}
                  onClick={() => setScreen('M2')}
                >
                  <Footprints size={18} />
                  <span>Home</span>
                </button>
                <button
                  className={`p-nav-item ${screen === 'M3' ? 'active' : ''}`}
                  onClick={() => setScreen('M3')}
                >
                  <Store size={18} />
                  <span>Queue</span>
                </button>

                <button
                  className={`p-nav-item ${screen === 'M5' || screen === 'M6' ? 'active' : ''}`}
                  onClick={() => setScreen('M5')}
                >
                  <Camera size={18} />
                  <span>Audit</span>
                </button>
                <button
                  className="p-nav-item"
                  onClick={() => nav('/manager')}
                >
                  <Workflow size={18} />
                  <span>Manager</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  )
}
const CSS = `
.page-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #F4F8FC;
  color: #172B4D;
}

.page-header-bar {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 28px;
  border-bottom: 1px solid #D9E6F2;
  background: #FFFFFF;
  flex-shrink: 0;
  box-shadow: 0 1px 0 rgba(43, 95, 135, 0.03);
  justify-content: space-between;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-brand .wordmark {
  font-size: 15px;
  font-weight: 800;
  color: #172B4D;
  letter-spacing: -0.01em;
}

.header-sep {
  color: #C3D3E0;
  font-size: 13px;
}

.page-header-bar .crumb {
  font-size: 13px;
  font-weight: 600;
  color: #64748B;
}

.mobile-exp-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: #F4F8FC;
}

.mobile-exp-header {
  width: 100%;
  max-width: 900px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 18px;
  padding: 22px 26px;
  box-shadow: 0 8px 24px rgba(43, 95, 135, 0.07);
  margin-top: 4px;
}

.mobile-exp-header h2 {
  font-size: 19px;
  font-weight: 800;
  color: #172B4D;
  margin: 6px 0 4px;
}

.mobile-exp-header p.mu {
  font-size: 13px;
  line-height: 1.5;
  max-width: 460px;
}

.mobile-nav-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Base card / pill / button primitives — referenced across the page but
   never had a shape/typography rule, which is why they were rendering as
   plain unstyled text. */
.card {
  border-radius: 16px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  background: #EEF2F6;
  color: #5B6B7C;
  border: 1px solid #E1E8EE;
  white-space: nowrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid #D9E6F2;
  background: #FFFFFF;
  color: #48647D;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.btn:hover {
  border-color: #A9D3F2;
  color: #2F80C0;
}

/* =========================================================
   PHONE SHELL
   ========================================================= */

.phone-wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 10px;
}

.phone-frame {
  width: 380px;
  height: 760px;
  background: #E8F1F8;
  border: 10px solid #000000;
  border-radius: 44px;
  box-shadow:
    0 25px 60px -15px rgba(41, 72, 101, 0.28),
    0 0 0 2px rgba(0, 0, 0, 0.15);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.phone-notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 140px;
  height: 24px;
  background: #C7D8E7;
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 14px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.notch-speaker {
  width: 36px;
  height: 4px;
  background: #7B9AB5;
  border-radius: 4px;
}

.notch-camera {
  width: 8px;
  height: 8px;
  background: #7B9AB5;
  border-radius: 50%;
}

.phone-status-bar {
  height: 38px;
  padding: 8px 18px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #64748B;
  z-index: 90;
}

.phone-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F4F8FC;
  position: relative;
  overflow: hidden;
}

.m-screen {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 65px;
  color: #172B4D;
}

.phone-nav-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: #FFFFFF;
  border-top: 1px solid #D9E6F2;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
  z-index: 90;
}

.p-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: #7A8FA3;
  font-size: 10px;
  font-weight: 600;
}

.p-nav-item.active {
  color: #2F80C0;
}

.m-full-btn {
  width: 100%;
  padding: 12px;
  margin-top: 10px;
}
.header-logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #D9E6F2;
  background: #FFFFFF;
  color: #64748B;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-logout:hover {
  border-color: #F0CACA;
  color: #C53D3D;
}
/* =========================================================
   SHARED LIGHT BLUE STATES
   ========================================================= */

.m-screen h1,
.m-screen h2,
.m-screen h3,
.m-screen h4,
.m-screen b {
  color: #172B4D;
}

.mu {
  color: #6B8195;
}

.mu.sm {
  color: #6B8195;
}

.mu.xs {
  color: #7890A5;
}

.lime {
  color: #2F80C0 !important;
}

.red {
  color: #D64545 !important;
}

.amb {
  color: #C77A16 !important;
}

.grow {
  flex: 1;
}

/* =========================================================
   SCREEN 1 — LOGIN
   ========================================================= */

.m1-screen {
  justify-content: center;
  text-align: center;
}

.m-brand .m-logo {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #2F80C0;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  box-shadow: 0 8px 20px rgba(47, 128, 192, 0.22);
}

.m-brand .m-logo svg {
  color: #FFFFFF !important;
}

.m1-card {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 20px;
  padding: 18px;
  text-align: left;
  box-shadow: 0 8px 24px rgba(43, 95, 135, 0.07);
}

.m1-profile {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.m1-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #E4F1FB;
  color: #2F80C0;
  display: grid;
  place-items: center;
  font-weight: 800;
}

.m1-details {
  display: grid;
  gap: 10px;
  border-top: 1px solid #D9E6F2;
  padding-top: 12px;
}

.m1-details div {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

/* =========================================================
   SCREEN 2 — HOME
   ========================================================= */

.m-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.m-avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #E4F1FB;
  color: #2F80C0;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12px;
}

.m2-kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.m2-kpi {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 14px;
  padding: 10px 8px;
  text-align: center;
  box-shadow: 0 3px 10px rgba(43, 95, 135, 0.04);
}

.m2-kpi b {
  display: block;
  font-size: 14px;
  font-family: Sora;
  color: #172B4D;
}

.m2-kpi span {
  font-size: 9px;
  color: #71869A;
  font-weight: 700;
}

.m2-kpi b.lime {
  color: #2F80C0 !important;
}

.m2-next-card {
  background: #FFFFFF;
  border: 1px solid #A9D3F2;
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 8px 22px rgba(47, 128, 192, 0.08);
}

.m2-next-badge {
  font-size: 10px;
  font-weight: 800;
  color: #2F80C0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.m2-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 11px;
  color: #71869A;
}

.m2-reasons {
  display: grid;
  gap: 4px;
  font-size: 11px;
  margin: 4px 0;
}

.m2-reasons div {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot-lime {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #4A9BD1;
}

.m2-action-box {
  background: #EDF6FC;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #D9EAF6;
  font-size: 11px;
}

.m2-alerts {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 16px;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.m2-alert-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
}

.m2-alert-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

/* =========================================================
   SCREEN 3 — PRIORITY QUEUE
   ========================================================= */

.m-nav-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.m-back {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  color: #48647D;
  display: grid;
  place-items: center;
}

.m-sub {
  margin-top: -6px;
}

.m3-list {
  display: grid;
  gap: 10px;
}

.m3-card {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 3px 12px rgba(43, 95, 135, 0.04);
}

.m3-card:hover {
  border-color: #8CC4EA;
  box-shadow: 0 6px 18px rgba(47, 128, 192, 0.08);
}

.m3-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.m3-rank {
  font-family: Sora;
  font-weight: 800;
  color: #2F80C0;
  font-size: 14px;
}

.m3-score-ring {
  text-align: center;
  background: #EDF6FC;
  padding: 4px 8px;
  border-radius: 10px;
  border: 1px solid #D5E8F5;
}

.m3-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.m3-reason {
  font-size: 11px;
  color: #6B8195;
}

.m3-cta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  border-top: 1px solid #D9E6F2;
  padding-top: 8px;
}

/* =========================================================
   SCREEN 4 — MERCHANT VISIT
   ========================================================= */

.m4-card {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 20px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 5px 18px rgba(43, 95, 135, 0.05);
}

.m4-geofence {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #EDF6FC;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid #D5E8F5;
  font-size: 11px;
}

.m4-geo-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #DCEEF9;
  display: grid;
  place-items: center;
}

.m4-geo-icon svg {
  color: #2F80C0 !important;
}

.m4-history {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 11px;
}

.m4-history div {
  background: #F7FAFD;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #D9E6F2;
}

/* =========================================================
   SCREEN 5 — AUDIT
   ========================================================= */

.m5-photo-box {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 18px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 15px rgba(43, 95, 135, 0.05);
}

.m5-photo-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  z-index: 10;
}

.m5-tag {
  font-size: 9px;
  font-weight: 800;
  background: rgba(255,255,255,0.94);
  padding: 4px 8px;
  border-radius: 99px;
  color: #48647D;
  border: 1px solid #D9E6F2;
}

.m5-tag.lime-bg {
  color: #2F80C0;
  background: #EAF5FC;
}

.m5-evidence-unavailable {
  padding: 40px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.m5-evidence-unavailable svg {
  color: #4A9BD1 !important;
}

.m5-signals {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 18px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 4px 15px rgba(43, 95, 135, 0.04);
}

.m5-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.m5-stat {
  background: #EDF6FC;
  padding: 8px;
  border-radius: 10px;
  font-size: 11px;
}

.m5-stat span {
  display: block;
  color: #71869A;
  font-size: 10px;
}

.m5-authenticity {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #EAF5FC;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #CFE5F4;
  font-size: 11px;
  color: #2F80C0;
}

.m5-authenticity svg {
  color: #2F80C0 !important;
}

/* =========================================================
   SCREEN 6 — AI INTERVENTION
   ========================================================= */

.m6-card {
  background: #FFFFFF;
  border: 1px solid #D9E6F2;
  border-radius: 20px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 5px 18px rgba(43, 95, 135, 0.05);
}

.m6-issue {
  background: #FFF1F1;
  border: 1px solid rgba(214, 69, 69, 0.18);
  padding: 10px;
  border-radius: 12px;
  font-size: 12px;
  color: #C53D3D;
}

.m6-recommendation {
  background: #EDF6FC;
  border: 1px solid #D5E8F5;
  padding: 12px;
  border-radius: 12px;
}

.m6-recommendation h4 {
  color: #2F80C0;
  font-size: 13px;
  margin-top: 4px;
}

.m6-guidance {
  background: #F7FAFD;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #D9E6F2;
  display: grid;
  gap: 6px;
}

.m6-g-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
  color: #2F80C0;
}

.m6-g-head svg {
  color: #2F80C0 !important;
}

.m6-hindi {
  font-size: 13px;
  font-weight: 600;
  color: #172B4D;
  line-height: 1.4;
}

.m6-audio-status {
  font-size: 10px;
  color: #71869A;
  display: flex;
  align-items: center;
  gap: 4px;
}

.m6-pipeline {
  background: #EDF6FC;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #D5E8F5;
  font-size: 10px;
}

.m6-pipe-flow {
  display: flex;
  gap: 4px;
  color: #2F80C0;
  margin-top: 4px;
  font-weight: 700;
  flex-wrap: wrap;
}

.m6-incentive {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #EAF7F2;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(5,150,105,0.18);
  font-size: 12px;
  color: #16805D;
}

.m6-done-box {
  text-align: center;
  padding: 16px;
  background: #EDF6FC;
  border: 1px solid #D5E8F5;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

/* =========================================================
   SHARED BLUE BUTTON / PILL OVERRIDES
   ========================================================= */

.btn.p {
  background: #2F80C0;
  color: #FFFFFF;
  border-color: #2F80C0;
  box-shadow: 0 5px 14px rgba(47, 128, 192, 0.18);
}

.btn.p:hover {
  background: #2672AD;
  border-color: #2672AD;
}

.pill.ev {
  background: #EAF5FC;
  color: #2F80C0;
  border-color: #CFE5F4;
}

.pill.HIGH {
  background: #FFF1F1;
  color: #C53D3D;
  border-color: #F0CACA;
}

.lnk {
  color: #2F80C0;
  cursor: pointer;
}

.lnk:hover {
  color: #236A9F;
}

/* =========================================================
   SCROLLBAR
   ========================================================= */

.m-screen::-webkit-scrollbar {
  width: 5px;
}

.m-screen::-webkit-scrollbar-track {
  background: #EEF4F8;
}

.m-screen::-webkit-scrollbar-thumb {
  background: #B8CFDF;
  border-radius: 10px;
}

.m-screen::-webkit-scrollbar-thumb:hover {
  background: #91B5CE;
}
`