// Small shared pieces for the FSE mobile app. They only reuse the phone design's existing classes.
import { AlertTriangle, Loader2, Volume2 } from 'lucide-react'
import { mediaUrl } from '../../services/api'

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="m5-evidence-unavailable">
      <Loader2 size={22} className="m-spin" />
      <span className="mu sm">{label}</span>
    </div>
  )
}

// Backend errors are shown as-is (ApiError message carries the HTTP status and the backend's detail).
export function ErrorBox({ error, onRetry, title = 'Something went wrong' }) {
  if (!error) return null
  const text = typeof error === 'string' ? error : error.message || String(error)
  return (
    <div className="m6-issue" role="alert">
      <span className="mu xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <AlertTriangle size={12} /> {title.toUpperCase()}
      </span>
      <p style={{ margin: '4px 0 0' }}>{text}</p>
      {onRetry && (
        <button className="btn" style={{ marginTop: 8 }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

// Voice note / spoken answer. `url` is the backend's absolute audio_url; it is always played through mediaUrl().
export function AudioPlayer({ url, label = 'Voice note', autoPlay = false }) {
  const src = mediaUrl(url)
  if (!src) return null
  return (
    <div className="m6-audio-status" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Volume2 size={14} /> {label}
      </span>
      <audio controls autoPlay={autoPlay} src={src} style={{ width: '100%', height: 36 }} />
    </div>
  )
}
