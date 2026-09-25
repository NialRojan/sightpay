// Device GPS for POST /visits (lat/lng) and the queue's distance ranking (GET /fse/{id}/queue?lat=&lng=).
// NOTE: browsers only expose geolocation (and getUserMedia) in a secure context: https:// or http://localhost.
// A phone opening http://<LAN-IP>:5173 gets `null` here; see docs/frontend-integration.md ("Phone access").

export function getCurrentPosition({ timeout = 8000, maximumAge = 30000 } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge },
    )
  })
}
