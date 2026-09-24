const BASE = import.meta.env.VITE_API_URL || ''
export async function get(path, fallback) {
  if (!BASE) return fallback
  try {
    const r = await fetch(BASE + path)
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } catch {
    return fallback
  }
}
export async function post(path, body, fallback) {
  if (!BASE) return fallback
  try {
    const r = await fetch(BASE + path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } catch {
    return fallback
  }
}
