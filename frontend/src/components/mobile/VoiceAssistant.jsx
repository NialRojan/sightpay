// Floating voice assistant: record -> POST /voice/query (audio) -> transcript + answer + spoken answer.
// Falls back to typed questions (POST /voice/query with text) when recording is impossible (insecure context, no
// MediaRecorder, mic denied) or the backend has no Sarvam key (503).
import { useEffect, useRef, useState } from 'react'
import { Keyboard, Loader2, Mic, Send, Square, X } from 'lucide-react'
import { askVoiceAudio, askVoiceText } from '../../services/voice'
import { AudioPlayer, ErrorBox } from './common'

const CHIPS = ['Aaj mujhe kaunse merchants visit karne hain?', 'Is merchant ka problem kya hai?']
const INTENT_LABEL = { todays_visits: "Today's visits", merchant_issue: 'Merchant issue', unknown: 'Not understood' }

const canRecord = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window.MediaRecorder !== 'undefined'

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
  return types.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || ''
}

export function VoiceAssistant({ fseId, merchantId, merchantName, pos }) {
  const [open, setOpen] = useState(false)
  const [textMode, setTextMode] = useState(() => !canRecord())
  const [fallbackReason, setFallbackReason] = useState(() =>
    canRecord() ? null : 'Recording needs https or localhost and a browser with MediaRecorder: type your question instead.',
  )
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [answer, setAnswer] = useState(null)
  const [text, setText] = useState('')
  const recRef = useRef(null)

  useEffect(
    () => () => {
      const r = recRef.current
      if (r && r.state !== 'inactive') r.stop()
    },
    [],
  )

  const common = { fseId, merchantId: merchantId || undefined, lat: pos?.lat, lng: pos?.lng }

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      setAnswer(await fn())
    } catch (err) {
      if (err?.status === 503) {
        setTextMode(true)
        setFallbackReason(`Voice input is not available on the server (${err.detail}). Type your question instead.`)
      } else {
        setError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  const startRec = async () => {
    setError(null)
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setTextMode(true)
      setFallbackReason(`Microphone unavailable (${err?.message || err?.name}). Type your question instead.`)
      return
    }
    const mimeType = pickMime()
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0]
      const audio = new File(chunks, `query.${type.includes('ogg') ? 'ogg' : 'webm'}`, { type })
      if (!audio.size) {
        setError('Nothing was recorded. Try again.')
        return
      }
      run(() => askVoiceAudio({ ...common, audio }))
    }
    recRef.current = rec
    rec.start()
    setRecording(true)
  }

  const stopRec = () => recRef.current?.state === 'recording' && recRef.current.stop()

  const ask = (q) => {
    const t = (q ?? text).trim()
    if (!t) return
    setText(t)
    run(() => askVoiceText({ ...common, text: t, language: 'hi-IN' }))
  }

  return (
    <>
      {!open && (
        <button className="btn p m-mic-fab" onClick={() => setOpen(true)} aria-label="Voice assistant" title="Voice assistant">
          <Mic size={20} />
        </button>
      )}
      {open && (
        <div className="m-voice-layer" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="m6-card">
            <div className="m-nav-head">
              <h3 style={{ flex: 1 }}>Voice Assistant</h3>
              <button className="m-back" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <span className="mu xs" style={{ fontSize: 10 }}>
              {merchantName ? `ASKING ABOUT: ${merchantName.toUpperCase()}` : 'ASK ABOUT YOUR DAY OR A MERCHANT'}
            </span>

            {!textMode && (
              <div className="m6-done-box">
                <button
                  className="btn p"
                  style={{ width: 72, height: 72, borderRadius: '50%' }}
                  disabled={busy}
                  onClick={recording ? stopRec : startRec}
                  aria-label={recording ? 'Stop recording' : 'Start recording'}
                >
                  {recording ? <Square size={24} /> : <Mic size={28} />}
                </button>
                <span className="mu sm">{recording ? 'Listening… tap to send' : 'Tap and speak (Hindi, Marathi, English)'}</span>
                <span className="lnk" style={{ fontSize: 11 }} onClick={() => setTextMode(true)}>
                  <Keyboard size={12} /> Type instead
                </span>
              </div>
            )}

            {textMode && (
              <>
                {fallbackReason && <div className="m2-action-box">{fallbackReason}</div>}
                <div className="m3-tags">
                  {CHIPS.map((c) => (
                    <button key={c} className="pill ev" style={{ cursor: 'pointer' }} disabled={busy} onClick={() => ask(c)}>
                      {c}
                    </button>
                  ))}
                </div>
                <form
                  style={{ display: 'flex', gap: 6 }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    ask()
                  }}
                >
                  <input
                    className="btn"
                    style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', cursor: 'text', fontWeight: 500 }}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Apna sawaal likhiye…"
                    aria-label="Question"
                  />
                  <button className="btn p" type="submit" disabled={busy || !text.trim()} aria-label="Ask">
                    <Send size={14} />
                  </button>
                </form>
                {canRecord() && (
                  <span className="lnk" style={{ fontSize: 11 }} onClick={() => setTextMode(false)}>
                    <Mic size={12} /> Use microphone
                  </span>
                )}
              </>
            )}

            {busy && (
              <div className="m2-alert-item">
                <Loader2 size={16} className="m-spin" /> <span className="mu sm">Thinking…</span>
              </div>
            )}
            <ErrorBox error={error} title="Voice assistant error" />

            {answer && (
              <div className="m6-guidance">
                <span className="mu xs" style={{ fontSize: 10 }}>YOU ASKED ({answer.language}) · {INTENT_LABEL[answer.intent] || answer.intent}</span>
                <p className="mu sm" style={{ margin: 0, fontSize: 12 }}>“{answer.transcript}”</p>
                <p className="m6-hindi" lang={answer.language}>{answer.answer_local}</p>
                {answer.answer_en && answer.answer_en !== answer.answer_local && (
                  <p className="mu sm" style={{ margin: 0, fontSize: 12 }}>
                    <b>English:</b> {answer.answer_en}
                  </p>
                )}
                {answer.audio_url ? (
                  <AudioPlayer url={answer.audio_url} label="Spoken answer" autoPlay />
                ) : (
                  <span className="m6-audio-status">Text answer only (no spoken audio from the server)</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
