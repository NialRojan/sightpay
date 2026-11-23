import { T } from '../Language'
// M5: capture a counter photo, attach GPS, POST /visits (analyze=true) and watch pipeline_log[] live.
import { useEffect, useState } from 'react'
import { ArrowLeft, Camera, Check, ImagePlus, Loader2, MapPin, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { ACTION_LABEL, STATUS_LABEL, STEP_LABEL, fmtTime } from '../../services/format'
import { TERMINAL_STATUSES } from '../../services/visits'
import { ErrorBox } from './common'
import { GEOFENCE_M, distanceM } from './util'

export function CaptureScreen({ merchant, gps, onRefreshGps, visit, submitting, error, onSubmit, onReset, onBack, onOutcome }) {
  const [photo, setPhoto] = useState(null) // {file, url, source, capturedAt}
  const [useDemo, setUseDemo] = useState(false)

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo])

  const pick = (source) => (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhoto({ file, url: URL.createObjectURL(file), source, capturedAt: new Date() })
  }

  const loc = gps.pos ? { lat: gps.pos.lat, lng: gps.pos.lng, demo: false } : useDemo && merchant ? { lat: merchant.lat, lng: merchant.lng, demo: true } : null
  const dist = gps.pos && merchant ? distanceM(gps.pos, merchant) : null
  const locked = submitting || !!visit
  const canSubmit = !!photo && !!loc && !locked && !!merchant

  const submit = () =>
    onSubmit({ photo: photo.file, captureSource: photo.source, capturedAt: photo.capturedAt, lat: loc.lat, lng: loc.lng })

  const newCapture = () => {
    setPhoto(null)
    onReset()
  }

  return (
    <div className="m-screen m5-screen">
      <div className="m-nav-head">
        <button className="m-back" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <h3><T>Capture Evidence</T></h3>
        <span className="pill ev"><T>AI Audit</T></span>
      </div>
      {merchant && <p className="mu sm m-sub">{merchant.name} · {merchant.owner_name}</p>}

      {/* Photo */}
      <div className="m5-photo-box">
        {photo && (
          <div className="m5-photo-overlay">
            <span className="m5-tag">
              <Camera size={12} /> {photo.source === 'camera' ? 'CAMERA CAPTURE' : 'GALLERY PICK'} · {fmtTime(photo.capturedAt.toISOString())}
            </span>
            {loc && (
              <span className={`m5-tag ${loc.demo ? '' : 'lime-bg'}`}>
                <MapPin size={12} /> {loc.demo ? 'DEMO LOCATION' : 'GPS'}
              </span>
            )}
          </div>
        )}
        {photo ? (
          <img className="m5-preview" src={photo.url} alt="Counter photo to submit" />
        ) : (
          <div className="m5-evidence-unavailable">
            <Camera size={32} color="var(--sp-accent)" />
            <b>Merchant Counter Photo</b>
            <span>Photograph the billing counter: Paytm QR, Soundbox and any competitor QR.</span>
          </div>
        )}
      </div>

      {!locked && (
        <div className="m5-capture-btns">
          <label className="btn p">
            <Camera size={15} /> {photo ? 'Retake' : 'Take photo'}
            <input type="file" accept="image/*" capture="environment" onChange={pick('camera')} data-testid="camera-input" />
          </label>
          <label className="btn">
            <ImagePlus size={15} /> Gallery
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick('gallery')} data-testid="gallery-input" />
          </label>
        </div>
      )}
      {photo?.source === 'gallery' && !locked && (
        <div className="m2-action-box">
          <b>Gallery photo:</b> costs 25 authenticity points and sends the visit to manager review. Use the camera at the shop.
        </div>
      )}

      {/* Location */}
      <div className="m4-geofence">
        <div className="m4-geo-icon">
          <MapPin size={18} />
        </div>
        <div className="grow">
          {gps.pos ? (
            <>
              <b>GPS {gps.pos.lat.toFixed(5)}, {gps.pos.lng.toFixed(5)}</b>
              <div className="mu xs">
                {dist == null ? '' : `${dist} m from the shop · ${dist <= GEOFENCE_M ? 'inside' : 'OUTSIDE'} ${GEOFENCE_M} m geofence`}
              </div>
            </>
          ) : gps.pending ? (
            <b>Getting GPS…</b>
          ) : useDemo ? (
            <>
              <b className="amb">DEMO: using the shop's own location</b>
              <div className="mu xs">
                Device GPS is unavailable, so the shop's coordinates ({merchant?.lat}, {merchant?.lng}) are sent. This makes the GPS check pass: demo only.
              </div>
            </>
          ) : (
            <>
              <b className="red">GPS unavailable</b>
              <div className="mu xs">A visit needs a location. Browsers only share GPS over https or localhost.</div>
            </>
          )}
        </div>
      </div>
      {!gps.pos && !gps.pending && !locked && (
        <div className="m5-capture-btns">
          <button className="btn" onClick={onRefreshGps}>
            <RotateCcw size={14} /> <T>Retry GPS</T>
          </button>
          <button className={`btn ${useDemo ? 'p' : ''}`} onClick={() => setUseDemo((v) => !v)} aria-pressed={useDemo}>
            <MapPin size={14} /> {useDemo ? 'Demo location ON' : 'Demo: use shop location'}
          </button>
        </div>
      )}

      <ErrorBox error={error} title="Upload failed" />

      {!visit && (
        <button className="btn p m-full-btn" disabled={!canSubmit} onClick={submit}>
          {submitting ? <Loader2 size={16} className="m-spin" /> : <Sparkles size={16} />}
          <T>{submitting ? 'Uploading…' : 'Submit and analyze'}</T>
        </button>
      )}

      {visit && <PipelineJourney key={visit.id} visit={visit} onOutcome={onOutcome} onNewCapture={newCapture} />}
    </div>
  )
}

// The live journey. Steps come from the real pipeline_log; in inline mode they arrive all at once, so they are
// revealed one by one to show the order they ran in.
function PipelineJourney({ visit, onOutcome, onNewCapture }) {
  const log = visit.pipeline_log || []
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (shown >= log.length) return undefined
    const t = setTimeout(() => setShown((n) => n + 1), 450)
    return () => clearTimeout(t)
  }, [shown, log.length])

  const terminal = TERMINAL_STATUSES.includes(visit.status)
  const done = terminal && shown >= log.length
  const audit = visit.audit
  const auth = visit.authenticity

  return (
    <>
      <div className="m5-signals">
        <h4>
          Live pipeline · Visit #{visit.id}{' '}
          <span className="pill ev" style={{ marginLeft: 6 }}>
            {done ? STATUS_LABEL[visit.status] : 'Analyzing'}
          </span>
        </h4>
        <div className="m2-alerts" style={{ border: 0, padding: 0 }}>
          {log.slice(0, shown).map((s, i) => (
            <div className="m2-alert-item" key={`${s.step}-${i}`} style={{ alignItems: 'flex-start' }}>
              <span className={`pill ${s.step === 'error' || s.step === 'block' ? 'HIGH' : 'ev'}`}>
                <Check size={11} />
              </span>
              <div className="grow">
                <b style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {STEP_LABEL[s.step] || s.step} <span className="mu xs">{fmtTime(s.at)}</span>
                </b>
                <span className="mu sm">{s.summary}</span>
              </div>
            </div>
          ))}
          {!done && (
            <div className="m2-alert-item">
              <Loader2 size={16} className="m-spin" />
              <span className="mu sm">{shown < log.length || visit.status === 'analyzing' ? 'Running next step…' : 'Finishing…'}</span>
            </div>
          )}
        </div>
      </div>

      {done && audit && (
        <div className="m5-signals">
          <h4>Vision AI Analysis</h4>
          <div className="m5-grid">
            <div className="m5-stat">
              <span>QR Visibility</span>
              <b className={audit.qr_visibility_score >= 70 ? 'lime' : 'red'}>{audit.qr_visibility_score} / 100</b>
            </div>
            <div className="m5-stat">
              <span>QR Placement</span>
              <b className={audit.qr_obstructed ? 'amb' : 'lime'}>{audit.qr_obstructed ? 'Obstructed' : 'Clear'}</b>
            </div>
            <div className="m5-stat">
              <span>Soundbox</span>
              <b className={audit.soundbox_visible ? 'lime' : 'red'}>{audit.soundbox_visible ? 'Visible' : 'Not visible'}</b>
            </div>
            <div className="m5-stat">
              <span>Competitor</span>
              <b className={audit.competitor_dominance === 'high' ? 'red' : ''}>
                {audit.competitor ? `${audit.competitor} ${String(audit.competitor_dominance || '').toUpperCase()}` : 'None'}
              </b>
            </div>
            <div className="m5-stat">
              <span>Image quality</span>
              <b>{audit.image_quality}</b>
            </div>
            <div className="m5-stat">
              <span>Recommended</span>
              <b>{ACTION_LABEL[audit.recommended_action] || audit.recommended_action}</b>
            </div>
          </div>
        </div>
      )}

      {done && auth && (
        <div className="m5-authenticity">
          <ShieldCheck size={16} color="var(--sp-accent)" />
          <div>
            <b>Multi-Signal Authenticity: {auth.score} / 100 · {auth.verdict}</b>
            <span className="mu xs" style={{ display: 'block' }}>
              Combined evidence signals
            </span>
          </div>
        </div>
      )}

      {done && (
        <>
          <button className="btn p m-full-btn" onClick={onOutcome}>
            <Sparkles size={16} /> VIEW OUTCOME
          </button>
          <button className="btn m-full-btn" onClick={onNewCapture}>
            <RotateCcw size={14} /> New capture for this merchant
          </button>
        </>
      )}
    </>
  )
}
