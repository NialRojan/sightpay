// Who is using the app. The backend has no auth: the Login page picks an FSE from GET /api/fse (or the manager
// role) and stores it here. Everything is wrapped in try/catch because localStorage can throw (private mode).

const FSE_KEY = 'sightpay.fse'
const ROLE_KEY = 'sightpay.role'
const MANAGER_KEY = 'sightpay.manager'

export const DEFAULT_FSE_ID = 1 // "Amit Patil" in the seed data

function read(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: the value just is not remembered */
  }
}

// {id, name, territory} as returned by GET /api/fse, or null if nobody picked one yet.
export const getCurrentFse = () => read(FSE_KEY)
export const setCurrentFse = (fse) => write(FSE_KEY, fse ? { id: fse.id, name: fse.name, territory: fse.territory } : null)
export const getCurrentFseId = () => Number(getCurrentFse()?.id) || DEFAULT_FSE_ID

// 'fse' | 'manager'
export const getRole = () => read(ROLE_KEY) || 'fse'
export const setRole = (role) => write(ROLE_KEY, role === 'manager' ? 'manager' : 'fse')

// Sent as `resolved_by` when a manager approves/rejects an escalation.
export const getManagerName = () => read(MANAGER_KEY) || 'Operations Manager'
export const setManagerName = (name) => write(MANAGER_KEY, name || null)

export function signOut() {
  write(FSE_KEY, null)
  write(ROLE_KEY, null)
}
