// Voice assistant (Sarvam). Without SARVAM_API_KEY: text queries work (answer_local = English, audio_url null),
// audio queries fail with 503 and /voice/tts fails with 503. Play audio_url through mediaUrl().
import { post, postForm } from './api'

// POST /voice/query (multipart, text) -> {transcript, language, intent, answer_en, answer_local, audio_url, merchant_id}
export const askVoiceText = ({ fseId, text, language = 'hi-IN', merchantId, lat, lng }) =>
  postForm('/voice/query', { fse_id: fseId, text, language, merchant_id: merchantId, lat, lng })

// POST /voice/query (multipart, audio: wav/webm Blob <= 10 MB, e.g. from MediaRecorder). Language is auto-detected.
export const askVoiceAudio = ({ fseId, audio, merchantId, lat, lng }) =>
  postForm('/voice/query', { fse_id: fseId, audio, merchant_id: merchantId, lat, lng })

// POST /voice/tts {text, language} -> {audio_url}
export const textToSpeech = (text, language = 'hi-IN') => post('/voice/tts', { text, language })
