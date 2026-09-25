// Helpers shared by the FSE mobile screens.

// Great-circle distance in metres (client-side geofence line on the merchant screen).
export function distanceM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

export const GEOFENCE_M = 100 // backend GPS_RADIUS_M default (docs/api-contract.md)

export const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

// "Open issue: QR obstruction" in the queue reasons -> "QR obstruction" (the queue has no recommended action field).
export const openIssue = (reasons) => {
  const r = (reasons || []).find((x) => x.startsWith('Open issue:'))
  return r ? r.replace('Open issue:', '').trim() : null
}

export const LANGUAGE_NAME = {
  'hi-IN': 'Hindi',
  'mr-IN': 'Marathi',
  'en-IN': 'English',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'gu-IN': 'Gujarati',
  'bn-IN': 'Bengali',
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}
