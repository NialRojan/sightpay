// Styles for the FSE mobile app (/fse/mobile). The base rules are the original phone-frame design; the
// additions at the end cover the live screens (capture, pipeline, outcome, voice) and the full-screen phone layout.
export const MOBILE_CSS = `
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

/* =========================================================
   LIVE APP: layout helpers only (no new colours or type);
   the live screens reuse the classes above.
   ========================================================= */

.m5-capture-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.m5-capture-btns input { display: none; }
.m5-preview { width: 100%; max-height: 240px; object-fit: cover; display: block; }
.m-spin { animation: m-spin 1s linear infinite; }
@keyframes m-spin { to { transform: rotate(360deg); } }
.m-mic-fab {
  position: absolute; right: 14px; bottom: 66px; z-index: 95; width: 46px; height: 46px; padding: 0;
  border-radius: 50%;
}
.m-voice-layer { position: absolute; inset: 0; z-index: 96; background: rgba(23, 43, 77, 0.25); display: flex; align-items: flex-end; }
.m-voice-layer .m6-card { width: 100%; max-height: 88%; overflow-y: auto; border-radius: 20px 20px 0 0; }

/* Phones: the app fills the screen instead of sitting in the simulated frame. */
@media (max-width: 600px) {
  .page-header-bar, .mobile-exp-header, .phone-notch { display: none; }
  .mobile-exp-container, .phone-wrapper { padding: 0; gap: 0; }
  .phone-frame { width: 100vw; height: 100vh; height: 100dvh; border: 0; border-radius: 0; box-shadow: none; }
}
`
