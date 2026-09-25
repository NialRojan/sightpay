// Minimal client for the SightPay FastAPI backend (see docs/api-contract.md).
//
// Base URL: `/api` by default, which the Vite dev server proxies to the backend (vite.config.js).
// Set VITE_API_URL to call a backend directly, e.g. VITE_API_URL=http://192.168.1.20:8000/api.
//
// Errors are never swallowed: a non-2xx response throws an ApiError carrying the HTTP status and the
// backend's `detail` message, so pages can show it (e.g. 409 "Visit is already completed").

export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

// Origin that serves /media when the API is called directly (VITE_API_URL absolute); '' = same origin / proxy.
const MEDIA_ORIGIN = /^https?:\/\//i.test(API_BASE) ? new URL(API_BASE).origin : ''

export class ApiError extends Error {
  constructor(status, detail, path) {
    super(status ? `${detail} (HTTP ${status})` : detail)
    this.name = 'ApiError'
    this.status = status // 0 = network error / backend unreachable
    this.detail = detail
    this.path = path
  }
}

// FastAPI returns {detail: "text"} for HTTPException and {detail: [{loc, msg, ...}]} for validation (422) errors.
function detailText(body, fallback) {
  const d = body?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length) {
    return d.map((e) => `${(e.loc || []).filter((p) => p !== 'body' && p !== 'query').join('.')}: ${e.msg}`).join('; ')
  }
  return fallback
}

function qs(params) {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export async function request(path, { method = 'GET', params, json, form, signal } = {}) {
  const url = API_BASE + path + qs(params)
  const init = { method, signal, headers: { Accept: 'application/json' } }
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(json)
  } else if (form !== undefined) {
    init.body = form // the browser sets the multipart boundary; do not set Content-Type
  }

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(0, `Cannot reach the SightPay backend at ${API_BASE} (${err?.message || 'network error'})`, path)
  }

  if (res.status === 204) return null
  const text = await res.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!res.ok) throw new ApiError(res.status, detailText(body, res.statusText || 'Request failed'), path)
  return body
}

export const get = (path, params, opts) => request(path, { ...opts, params })
export const post = (path, json = {}, opts) => request(path, { ...opts, method: 'POST', json })

// `fields` is a plain object (undefined/null/'' values are skipped, Blobs/Files are appended as files) or a FormData.
export function postForm(path, fields, opts) {
  let form = fields
  if (!(fields instanceof FormData)) {
    form = new FormData()
    for (const [k, v] of Object.entries(fields || {})) {
      if (v === undefined || v === null || v === '') continue
      if (v instanceof Blob) form.append(k, v, v.name || `${k}.${(v.type || '').split('/')[1] || 'bin'}`)
      else form.append(k, String(v))
    }
  }
  return request(path, { ...opts, method: 'POST', form })
}

// photo_url / audio_url come back absolute, built from the backend's PUBLIC_BASE_URL (default
// http://localhost:8000), which is wrong on a phone. Render them through this helper: it keeps the /media/... path
// and serves it from the same origin (proxied by Vite) or from VITE_API_URL's origin. Returns null for null input.
export function mediaUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url, window.location.origin)
    if (u.pathname.startsWith('/media/')) return MEDIA_ORIGIN + u.pathname + u.search
    return u.href
  } catch {
    return url
  }
}
