import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Navigation,
  ChevronDown,
  Camera,
  Map as MapIcon,
  Network,
  LocateFixed,
  MapPin,
  Activity,
  Radio,
} from 'lucide-react'
import L from 'leaflet'
import Layout from '../components/Layout'
import {
  StatCard,
  ScoreRing,
  PriorityTable,
  ActivityTimeline,
  AlertCard,
  PriorityBadge,
  EvidenceIndicator,
} from '../components/ui'
import { getMerchants, getProfile } from '../services/merchants'
import { getKpis, getActivity, getMapPoints } from '../services/visits'
import { getAlerts } from '../services/audits'
import { getHealth, getMini } from '../services/analytics'

import 'leaflet/dist/leaflet.css'

/* ============================================================
   DATA HELPERS
   ============================================================ */

const dig = (o, path) => path.split('.').reduce((a, k) => a?.[k], o)

function pick(o, paths) {
  for (const p of paths) {
    const v = dig(o, p)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

function numberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(',', '.')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const LAT_KEYS = ['lat', 'latitude', 'location.lat', 'location.latitude', 'coordinates.lat', 'coordinates.latitude']
const LNG_KEYS = ['lng', 'lon', 'longitude', 'location.lng', 'location.lon', 'location.longitude', 'coordinates.lng', 'coordinates.lon', 'coordinates.longitude']

function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

const STATUS_LABEL = {
  done: 'Completed',
  high: 'High priority',
  medium: 'Medium priority',
  normal: 'Pending',
}

/* Adds id / name / address / lat / lng / tier ('done' | 'high' | 'medium' | 'normal') */
function normalizeMapPoints(points) {
  if (!Array.isArray(points)) return []

  return points.flatMap((p, i) => {
    const lat = numberOrNull(pick(p, LAT_KEYS))
    const lng = numberOrNull(pick(p, LNG_KEYS))
    if (!validCoordinates(lat, lng)) return []

    const priority = String(
      pick(p, ['priority', 'pri', 'priorityLevel', 'priority_level', 'status']) ?? ''
    ).toLowerCase()

    const completed = Boolean(
      pick(p, ['completed', 'complete', 'done', 'visited']) ??
        String(p?.status ?? '').toLowerCase() === 'completed'
    )

    const tier = completed
      ? 'done'
      : /high|urgent|critical/.test(priority)
        ? 'high'
        : /medium|moderate/.test(priority)
          ? 'medium'
          : 'normal'

    return [
      {
        ...p,
        id: p?.id ?? p?.merchantId ?? p?.merchant_id ?? `merchant-${i}`,
        name:
          pick(p, ['name', 'merchantName', 'merchant_name', 'merchant', 'storeName', 'store_name']) ??
          `Merchant ${i + 1}`,
        address:
          pick(p, ['address', 'fullAddress', 'full_address', 'location.address', 'merchantAddress', 'merchant_address']) ?? '',
        lat,
        lng,
        priority,
        completed,
        tier,
      },
    ]
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function truncate(value, max) {
  const text = String(value ?? '')
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/* ============================================================
   OSM MARKER ICON
   ============================================================ */

const MARKER_GLYPH = {
  done: '<path d="M7 12.5l3.2 3.2L17 9"/>',
  high: '<path d="M12 6.5v7"/><circle cx="12" cy="17.4" r="1.2" fill="currentColor" stroke="none"/>',
  other: '<path d="M4.5 10.5 12 4.5l7.5 6v9h-15z"/><path d="M9.5 19.5V14h5v5.5"/>',
}

function createMarkerIcon(point) {
  const glyph = MARKER_GLYPH[point.tier] || MARKER_GLYPH.other

  return L.divIcon({
    className: 'sp-mk-wrap',
    html: `
      <div class="sp-mk sp-mk-${point.tier}">
        <div class="sp-mk-pulse"></div>
        <div class="sp-mk-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
        </div>
      </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  })
}

/* ============================================================
   OPENSTREETMAP VIEW
   ============================================================ */

const DEFAULT_CENTER = [12.9716, 77.5946]

function OpenStreetMapView({ points, onSelect, selectedPoint }) {
  const mapElementRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [mapReady, setMapReady] = useState(false)

  /* Create the Leaflet map once */
  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return

    const map = L.map(mapElementRef.current, {
      center: DEFAULT_CENTER,
      zoom: 12,
      zoomControl: false,
      preferCanvas: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    mapRef.current = map
    setMapReady(true)

    const t = setTimeout(() => map.invalidateSize(), 250)

    return () => {
      clearTimeout(t)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  /* Markers + framing */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    points.forEach((point) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: createMarkerIcon(point),
        title: point.name,
        riseOnHover: true,
      })

      marker.bindPopup(
        `<div class="sp-pu">
          <div class="sp-pu-title">${escapeHtml(point.name)}</div>
          ${point.address ? `<div class="sp-pu-addr">${escapeHtml(point.address)}</div>` : ''}
          <div class="sp-pu-row">
            <span class="sp-pu-tag sp-pu-${point.tier}">${escapeHtml(STATUS_LABEL[point.tier])}</span>
            <span class="sp-pu-coord">${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</span>
          </div>
        </div>`,
        { maxWidth: 300 }
      )

      marker.on('click', () => onSelect?.(point))
      marker.addTo(map)
      markersRef.current.push(marker)
    })

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: false })
    } else {
      map.setView(DEFAULT_CENTER, 12)
    }

    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [points, mapReady, onSelect])

  /* Fly to the selected merchant (also when returning from the network view) */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !selectedPoint) return

    map.flyTo([selectedPoint.lat, selectedPoint.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })

    const marker = markersRef.current.find((m) => {
      const pos = m.getLatLng()
      return (
        Math.abs(pos.lat - selectedPoint.lat) < 0.000001 &&
        Math.abs(pos.lng - selectedPoint.lng) < 0.000001
      )
    })
    marker?.openPopup()
  }, [selectedPoint, mapReady])

  function recenter() {
    const map = mapRef.current
    if (!map) return

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
        return
      }
    }
    map.setView(DEFAULT_CENTER, 12)
  }

  return (
    <div className="sp-stage sp-map-stage">
      <div className="sp-map" ref={mapElementRef} />

      <div className="sp-map-tools">
        <button type="button" className="sp-icon-btn" onClick={recenter} title="Fit all locations" aria-label="Fit all locations">
          <LocateFixed size={16} />
        </button>
        <div className="sp-box">
          <MapPin size={14} />
          <b>{points.length}</b> mapped
        </div>
      </div>

      {points.length === 0 && (
        <div className="sp-empty">
          <MapPin size={22} />
          <strong>No coordinates yet</strong>
          <span>Merchants appear here as soon as their field data includes a location.</span>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   SPIDER NETWORK
   Merchants are placed around the route centre by their real
   bearing and distance (radar-style), joined to the hub by
   spokes and to their two nearest neighbours by web threads.
   ============================================================ */

const W = 920
const H = 540
const CX = W / 2
const CY = H / 2
const SX = 1.55 // horizontal stretch so the web fills a wide card
const RMIN = 92 // 0 km
const RMAX = 210 // farthest merchant
const RINGS = [46, 92, 134, 172, 210, 244]
const LABEL_RINGS = [134, 172, 210]
const SPOKES = 12
const MIN_GAP = 58

const f = (n) => n.toFixed(1)
const spokeAngle = (k) => (k / SPOKES) * Math.PI * 2 - Math.PI / 2

/* A ring drawn as a sagging web thread between the radial spokes */
function webRing(r) {
  let d = ''
  for (let k = 0; k < SPOKES; k++) {
    const a0 = spokeAngle(k)
    const a1 = spokeAngle(k + 1)
    const am = (a0 + a1) / 2
    if (k === 0) d += `M${f(CX + Math.cos(a0) * r * SX)} ${f(CY + Math.sin(a0) * r)}`
    d += `Q${f(CX + Math.cos(am) * r * 0.9 * SX)} ${f(CY + Math.sin(am) * r * 0.9)} ${f(CX + Math.cos(a1) * r * SX)} ${f(CY + Math.sin(a1) * r)}`
  }
  return `${d}Z`
}

const WEB_RINGS = RINGS.map((r) => ({ r, d: webRing(r) }))
const WEB_SPOKES = Array.from({ length: SPOKES }, (_, k) => {
  const a = spokeAngle(k)
  const r = RINGS[RINGS.length - 1]
  return `M${CX} ${CY}L${f(CX + Math.cos(a) * r * SX)} ${f(CY + Math.sin(a) * r)}`
})

function curve(x1, y1, x2, y2, bend = 0.12) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  return `M${f(x1)} ${f(y1)}Q${f(mx - (y2 - y1) * bend)} ${f(my + (x2 - x1) * bend)} ${f(x2)} ${f(y2)}`
}

function wedge(deg) {
  const r = 250
  const a = (-deg * Math.PI) / 180
  return `M0 0L${r} 0A${r} ${r} 0 0 0 ${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}Z`
}

function buildNetwork(points) {
  const pts = points.slice(0, 24)
  if (!pts.length) return { nodes: [], links: [], maxDist: 0 }

  const cLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
  const cLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length
  const kx = 111.32 * Math.cos((cLat * Math.PI) / 180)

  const raw = pts.map((p) => {
    const dx = (p.lng - cLng) * kx
    const dy = (p.lat - cLat) * 110.57
    return { p, dx, dy, dist: Math.hypot(dx, dy) }
  })

  const maxDist = Math.max(...raw.map((r) => r.dist))
  const flat = maxDist < 0.05 // everything at (almost) the same spot

  const nodes = raw.map((r, i) => {
    const ang =
      flat || r.dist < 0.01
        ? (i / raw.length) * Math.PI * 2 - Math.PI / 2
        : Math.atan2(-r.dy, r.dx)
    const t = flat ? 0.6 : Math.sqrt(r.dist / maxDist)
    const rad = RMIN + (RMAX - RMIN) * t

    return {
      ...r.p,
      dist: r.dist,
      x: CX + Math.cos(ang) * rad * SX,
      y: CY + Math.sin(ang) * rad,
    }
  })

  /* Relax overlaps, keep nodes inside the web */
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= MIN_GAP) continue
        if (d < 0.01) {
          dx = Math.cos(i)
          dy = Math.sin(i)
          d = 1
        }
        const push = (MIN_GAP - d) / 2
        a.x -= (dx / d) * push
        a.y -= (dy / d) * push
        b.x += (dx / d) * push
        b.y += (dy / d) * push
      }
    }

    nodes.forEach((n) => {
      const nx = (n.x - CX) / SX
      const ny = n.y - CY
      const r = Math.hypot(nx, ny) || 1
      const c = Math.min(Math.max(r, RMIN - 34), RMAX + 10)
      if (c !== r) {
        n.x = CX + (nx / r) * c * SX
        n.y = CY + (ny / r) * c
      }
    })
  }

  /* Each merchant links to its two nearest neighbours */
  const seen = new Set()
  const links = []
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (!seen.has(key)) {
          seen.add(key)
          links.push([i, j])
        }
      })
  })

  return { nodes, links, maxDist }
}

function SpiderNetworkView({ points, onSelect, selectedPoint, onOpenMap }) {
  const { nodes, links, maxDist } = useMemo(() => buildNetwork(points), [points])
  const [hoverId, setHoverId] = useState(null)

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  )

  const focusId = hoverId ?? selectedPoint?.id ?? null
  const focusIdx = nodes.findIndex((n) => n.id === focusId)
  const focus = focusIdx >= 0 ? nodes[focusIdx] : null
  const focusLinks = focus
    ? links.filter(([a, b]) => a === focusIdx || b === focusIdx).length + 1
    : 0

  const ringKm = (r) => maxDist * Math.pow((r - RMIN) / (RMAX - RMIN), 2)
  const fmtKm = (km) => `${km < 10 ? km.toFixed(1) : Math.round(km)} km`

  return (
    <div className="sp-stage sp-net-stage">
      <svg
        className={`sp-net ${focus ? 'focus' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Merchant network around the field hub"
      >
        <defs>
          <radialGradient id="spHub">
            <stop offset="0%" stopColor="#1F5BFF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1F5BFF" stopOpacity="0" />
          </radialGradient>
          <filter id="spShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#1F5BFF" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Web: rings, then spokes */}
        {WEB_RINGS.map(({ r, d }, i) => (
          <path
            key={r}
            d={d}
            pathLength="1"
            className={`sp-web sp-draw ${i === WEB_RINGS.length - 1 ? 'outer' : ''}`}
            style={{ '--d': `${i * 90}ms` }}
          />
        ))}
        {WEB_SPOKES.map((d, k) => (
          <path key={k} d={d} pathLength="1" className="sp-web sp-draw" style={{ '--d': `${k * 40}ms` }} />
        ))}

        {maxDist >= 0.05 &&
          LABEL_RINGS.map((r) => (
            <text key={r} x={CX + 6} y={CY + r - 5} className="sp-ring-label">
              {fmtKm(ringKm(r))}
            </text>
          ))}

        {/* Radar sweep */}
        {!reduceMotion && (
          <g transform={`translate(${CX} ${CY}) scale(${SX} 1)`} className="sp-sweep-clip">
            <g className="sp-sweep">
              <path d={wedge(46)} fill="#1F5BFF" opacity="0.035" />
              <path d={wedge(30)} fill="#1F5BFF" opacity="0.045" />
              <path d={wedge(14)} fill="#1F5BFF" opacity="0.06" />
              <path d="M0 0L250 0" stroke="#1F5BFF" strokeOpacity="0.35" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </g>
          </g>
        )}

        <circle cx={CX} cy={CY} r="120" fill="url(#spHub)" />

        {/* Neighbour threads */}
        {links.map(([a, b]) => (
          <path
            key={`${a}-${b}`}
            d={curve(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, 0.18)}
            className={`sp-link ${a === focusIdx || b === focusIdx ? 'on' : ''}`}
          />
        ))}

        {/* Hub spokes + travelling data pulses */}
        {nodes.map((n, i) => {
          const d = curve(CX, CY, n.x, n.y, 0.08)
          const active = n.tier !== 'done'
          return (
            <g key={`spoke-${n.id}`}>
              <path
                d={d}
                pathLength="1"
                className={`sp-spoke sp-draw ${i === focusIdx ? 'on' : ''}`}
                style={{ '--d': `${350 + i * 45}ms` }}
              />
              {active && !reduceMotion && (
                <circle r={n.tier === 'high' ? 3.6 : 2.6} className={`sp-pulse ${n.tier}`}>
                  <animateMotion
                    dur={`${2.6 + (i % 5) * 0.45}s`}
                    begin={`${1.6 + (i % 7) * 0.35}s`}
                    repeatCount="indefinite"
                    path={d}
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="linear"
                  />
                </circle>
              )}
            </g>
          )
        })}

        {/* Merchant nodes */}
        {nodes.map((n, i) => (
          <g
            key={n.id}
            transform={`translate(${f(n.x)} ${f(n.y)})`}
            className={`sp-node ${n.tier} ${n.id === focusId ? 'on' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={`${n.name}, ${STATUS_LABEL[n.tier]}`}
            onMouseEnter={() => setHoverId(n.id)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(n.id)}
            onBlur={() => setHoverId(null)}
            onClick={() => onSelect?.(n)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(n)
              }
            }}
          >
            <g className="sp-pop" style={{ '--d': `${900 + i * 55}ms` }}>
              <g className="sp-body" filter="url(#spShadow)">
                {n.tier === 'high' && <circle r="20" className="sp-halo" />}
                <circle r="14" className="sp-dot" />
                {n.tier === 'done' && <path d="M-5 0.5l3.4 3.4L5.5-3.5" className="sp-glyph" />}
                {n.tier === 'high' && (
                  <>
                    <path d="M0-5.5v6" className="sp-glyph" />
                    <circle cy="5" r="1.2" className="sp-glyph-dot" />
                  </>
                )}
                {(n.tier === 'normal' || n.tier === 'medium') && <circle r="3.6" className="sp-glyph-fill" />}
              </g>
              <text y="33" className="sp-label">
                {truncate(n.name, 20)}
              </text>
            </g>
          </g>
        ))}

        {/* Hub */}
        <g transform={`translate(${CX} ${CY})`}>
          {!reduceMotion && (
            <>
              <circle r="40" className="sp-ripple" />
              <circle r="40" className="sp-ripple" style={{ animationDelay: '1.8s' }} />
            </>
          )}
          <circle r="42" fill="#fff" stroke="#1F5BFF" strokeWidth="2.5" filter="url(#spShadow)" />
          <circle r="31" fill="#EEF3FF" stroke="#C7D8FF" />
          <text y="-1" className="sp-hub-title">FSE</text>
          <text y="14" className="sp-hub-sub">Route centre</text>
        </g>
      </svg>

      {nodes.length === 0 && (
        <div className="sp-empty">
          <Network size={26} />
          <strong>No network yet</strong>
          <span>The web builds itself as soon as merchants have coordinates.</span>
        </div>
      )}

      {nodes.length > 0 && (
        <div className="sp-net-top">
          <div className="sp-box">
            <b>{nodes.length}</b> merchants
          </div>
          <div className="sp-box">
            <b>{links.length + nodes.length}</b> connections
          </div>
        </div>
      )}

      {nodes.length > 0 && (
        <aside className={`sp-info ${focus ? 'has' : ''}`} aria-live="polite">
          {focus ? (
            <>
              <span className={`sp-tag ${focus.tier}`}>{STATUS_LABEL[focus.tier]}</span>
              <h3>{focus.name}</h3>
              {focus.address && <p>{focus.address}</p>}
              <dl>
                <div>
                  <dt>From hub</dt>
                  <dd>{focus.dist < 0.05 ? '< 50 m' : fmtKm(focus.dist)}</dd>
                </div>
                <div>
                  <dt>Links</dt>
                  <dd>{focusLinks}</dd>
                </div>
              </dl>
              <button type="button" className="sp-link-btn" onClick={() => { onSelect?.(focus); onOpenMap?.() }}>
                <MapIcon size={13} /> Show on map
              </button>
            </>
          ) : (
            <p className="hint">Hover a merchant to trace its connections. Select one to keep it in focus.</p>
          )}
        </aside>
      )}

      <div className="sp-legend">
        <span><i className="normal" />Pending</span>
        <span><i className="high" />High priority</span>
        <span><i className="done" />Completed</span>
      </div>
    </div>
  )
}

/* ============================================================
   FIELD COVERAGE
   ============================================================ */

function FieldCoverage({ points, done, total, priority }) {
  const [view, setView] = useState('network')
  const [selectedPoint, setSelectedPoint] = useState(null)

  const normalized = useMemo(() => normalizeMapPoints(points), [points])

  const safeTotal = Number(total) || 0
  const safeDone = Number(done) || 0
  const safePriority = Number(priority) || 0
  const missing = Math.max(safeTotal - normalized.length, 0)
  const completion = safeTotal > 0 ? Math.min(Math.round((safeDone / safeTotal) * 100), 100) : 0

  return (
    <section className="card sp-field">
      <div className="sp-head">
        <div className="sp-head-ico">
          <Radio size={19} />
        </div>

        <div>
          <h2>
            Today's field coverage
            <span className="sp-live"><i />Live</span>
          </h2>
          <div className="sp-sub">
            {safeDone} of {safeTotal} visits completed, {normalized.length} locations mapped
          </div>
        </div>

        <div className="sp-seg" role="tablist" aria-label="Coverage view">
          <button type="button" role="tab" aria-selected={view === 'network'} className={view === 'network' ? 'on' : ''} onClick={() => setView('network')}>
            <Network size={14} /> Network
          </button>
          <button type="button" role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
            <MapIcon size={14} /> Map
          </button>
        </div>
      </div>

      <div className="sp-strip">
        <div className="sp-stat">
          <span>Completion</span>
          <strong className="blue">{completion}%</strong>
          <div className="sp-bar"><i style={{ width: `${completion}%` }} /></div>
        </div>
        <div className="sp-stat">
          <span>Mapped</span>
          <strong>{normalized.length}</strong>
        </div>
        <div className="sp-stat">
          <span>High priority</span>
          <strong>{safePriority}</strong>
        </div>
        <div className="sp-stat">
          <span>Missing location</span>
          <strong>{missing}</strong>
        </div>
      </div>

      {view === 'map' ? (
        <OpenStreetMapView points={normalized} selectedPoint={selectedPoint} onSelect={setSelectedPoint} />
      ) : (
        <SpiderNetworkView
          points={normalized}
          selectedPoint={selectedPoint}
          onSelect={setSelectedPoint}
          onOpenMap={() => setView('map')}
        />
      )}
    </section>
  )
}

/* ============================================================
   MAIN FSE PAGE
   ============================================================ */

export default function Fse() {
  const nav = useNavigate()

  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    Promise.all([
      getProfile(),
      getKpis(),
      getMerchants(),
      getMapPoints(),
      getActivity(),
      getAlerts(),
      getHealth(),
      getMini(),
    ])
      .then(([profile, kpis, merchants, points, activity, alerts, health, mini]) => {
        if (!mounted) return
        setD({ profile, kpis, merchants, points, activity, alerts, health, mini })
      })
      .catch((err) => {
        console.error('FSE dashboard failed:', err)
        if (mounted) setError(err)
      })

    return () => {
      mounted = false
    }
  }, [])

  if (error) {
    return (
      <Layout crumb="Operations">
        <style>{CSS}</style>
        <div className="pad sp-blue">
          <div className="card" style={{ padding: 24 }}>
            <h2>Unable to load operations</h2>
            <p className="mu">{error?.message || 'Something went wrong while loading field data.'}</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!d) {
    return (
      <Layout crumb="Operations">
        <style>{CSS}</style>
        <div className="pad sp-blue mu">Loading operations…</div>
      </Layout>
    )
  }

  const m = d.merchants?.[0] || {
    name: 'No merchant selected',
    km: '—',
    last: '—',
    qr: 0,
    reasons: [],
    competitor: '—',
    comp: '—',
    action: 'Awaiting field intelligence',
    pri: 'normal',
  }

  const done = Number(d.kpis?.[1]?.v) || 0
  const total = Number(d.kpis?.[0]?.v) || 0
  const priority = Number(d.kpis?.[2]?.v) || 0

  return (
    <Layout crumb="Operations" profile={d.profile}>
      <style>{CSS}</style>

      <div className="pad sp-blue">
        <div className="head">
          <div>
            <h1>Good morning, {d.profile.first}</h1>
            <p className="mu">Here’s what needs your attention today.</p>
          </div>

          <div className="grow" />

          <span className="pill ev">
            <i className="live" />
            Field mode active
          </span>

          <button className="btn sel">
            Today
            <ChevronDown size={15} />
          </button>
        </div>

        <div className="g4">
          {d.kpis.map((k, i) => (
            <StatCard key={k.k} label={k.k} value={k.v} note={k.d} up={k.up} i={i} />
          ))}
        </div>

        <div className="g2">
          <FieldCoverage points={d.points} done={done} total={total} priority={priority} />

          <section className="card next" style={{ '--i': 5 }}>
            <div className="row">
              <h2>Next Best Visit</h2>
              <span className="grow" />
              <PriorityBadge level={m.pri} />
            </div>

            <div className="row top16">
              <div>
                <h3>{m.name}</h3>
                <div className="mu sm">
                  <Navigation size={12} />
                  {m.km} km away · last visit {m.last}
                </div>
              </div>
              <span className="grow" />
              <ScoreRing value={m.qr} />
            </div>

            <div className="why">
              {(m.reasons || []).map((r) => (
                <div key={r}>
                  <i />
                  {r}
                </div>
              ))}
            </div>

            <div className="two">
              <div>
                <span className="mu sm">Competitor presence</span>
                <b>{m.competitor} · {m.comp}</b>
              </div>
              <div>
                <span className="mu sm">Evidence</span>
                <EvidenceIndicator />
              </div>
            </div>

            <div className="rec">
              <span className="mu sm">Recommended action</span>
              <b>{m.action}</b>
            </div>

            <div className="row gap">
              <button className="btn p grow" onClick={() => nav('/visits/SP-10482')}>
                <Camera size={16} />
                START VISIT
              </button>
              <button className="btn" onClick={() => nav('/merchants/m1')}>
                VIEW MERCHANT
              </button>
            </div>
          </section>
        </div>

        <div className="g2">
          <section className="card" style={{ '--i': 6 }}>
            <div className="row">
              <h2>AI Priority Queue</h2>
              <span className="grow" />
              <button className="lnk" onClick={() => nav('/fse/queue')}>
                View all
              </button>
            </div>
            <PriorityTable rows={d.merchants} />
          </section>

          <section className="card" style={{ '--i': 7 }}>
            <h2>Visit Activity</h2>
            <ActivityTimeline items={d.activity} />
          </section>
        </div>

        <div className="g2">
          <section className="card" style={{ '--i': 8 }}>
            <h2>Merchant Health</h2>
            <HealthGraph data={d.health} />
          </section>

          <section className="card" style={{ '--i': 9 }}>
            <h2>AI Alerts</h2>
            {d.alerts.map((a) => (
              <AlertCard key={a.title} a={a} />
            ))}
          </section>
        </div>

        <div className="g4">
          {d.mini.map((k, i) => (
            <div key={k.k} className="card mini" style={{ '--i': 10 + i }}>
              <span className="mu sm">{k.k}</span>
              <b className={k.warn ? 'red' : ''}>{k.v}</b>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}

/* ============================================================
   MERCHANT HEALTH GRAPH
   ============================================================ */

function HealthGraph({ data }) {
  const values = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return []

    return data
      .map((item, index) => {
        if (typeof item === 'number') return { label: `D${index + 1}`, value: item }

        const value =
          [item?.value, item?.v, item?.health, item?.score, item?.qr, item?.transactions, item?.transaction_count]
            .map(numberOrNull)
            .find((v) => v !== null) ?? 0

        return { label: item?.label ?? item?.day ?? item?.date ?? `D${index + 1}`, value }
      })
      .filter((item) => Number.isFinite(item.value))
  }, [data])

  if (!values.length) {
    return <div className="sp-health-empty">Waiting for merchant health data…</div>
  }

  const width = 760
  const height = 270
  const pad = { left: 45, right: 25, top: 25, bottom: 40 }

  const max = Math.max(...values.map((v) => v.value), 1)
  const min = Math.min(...values.map((v) => v.value), 0)
  const range = Math.max(max - min, 1)

  const getX = (i) =>
    values.length === 1 ? width / 2 : pad.left + (i / (values.length - 1)) * (width - pad.left - pad.right)
  const getY = (v) => pad.top + (1 - (v - min) / range) * (height - pad.top - pad.bottom)

  const linePath = values.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.value)}`).join(' ')
  const areaPath = `${linePath} L ${getX(values.length - 1)} ${height - pad.bottom} L ${getX(0)} ${height - pad.bottom} Z`

  const latest = values[values.length - 1]?.value ?? 0
  const previous = values.length > 1 ? values[values.length - 2]?.value ?? 0 : latest
  const change = latest - previous
  const step = Math.max(Math.ceil(values.length / 7), 1)

  return (
    <div className="sp-health">
      <div className="sp-health-stats">
        <div>
          <span className="mu sm">Current signal</span>
          <strong className="big">{latest.toFixed(0)}</strong>
        </div>
        <div>
          <span className="mu sm">Change</span>
          <strong className={change >= 0 ? 'up' : 'down'}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(1)}
          </strong>
        </div>
        <div>
          <span className="mu sm">Data points</span>
          <strong>{values.length}</strong>
        </div>
      </div>

      <div className="sp-health-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Merchant health over time">
          <defs>
            <linearGradient id="spHealthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1F5BFF" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#1F5BFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((line) => {
            const y = pad.top + (line / 3) * (height - pad.top - pad.bottom)
            return <line key={line} x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#E3ECFF" />
          })}

          <path d={areaPath} fill="url(#spHealthFill)" />
          <path d={linePath} fill="none" stroke="#1F5BFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {values.map((p, i) => {
            const x = getX(i)
            const y = getY(p.value)
            return (
              <g key={`${p.label}-${i}`}>
                <circle cx={x} cy={y} r="6" fill="#fff" stroke="#1F5BFF" strokeWidth="2.5" />
                {i % step === 0 && (
                  <text x={x} y={height - 15} textAnchor="middle" fill="#6C7FA6" fontSize="11">
                    {truncate(p.label, 10)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="sp-health-foot">
        <Activity size={12} />
        Merchant health signal over available field data
      </div>
    </div>
  )
}

/* ============================================================
   STYLES — white + blue theme, scoped to .sp-blue
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@500;600;700&display=swap');

.sp-blue{
  --ink:#0A1B3D; --ink2:#5B6E96; --line:#DDE7FB; --blue:#1F5BFF; --navy:#0B2A8A;
  --sky:#9CC0FF; --mist:#EEF3FF; --canvas:#F4F7FF;
  background:var(--canvas); color:var(--ink); font-family:Inter,system-ui,sans-serif;
}
.sp-blue h1,.sp-blue h2,.sp-blue h3{font-family:Sora,Inter,sans-serif;color:var(--ink);letter-spacing:-.02em}
.sp-blue .mu{color:var(--ink2)}
.sp-blue .card{
  background:rgba(255,255,255,0.92);color:var(--ink);border:1px solid var(--line);border-radius:18px;
  box-shadow:0 14px 36px -20px rgba(10,27,61,0.08);
}
.sp-blue .btn{background:var(--mist);color:var(--blue);border:1px solid var(--line);transition:.15s}
.sp-blue .btn:hover{border-color:var(--blue);color:var(--navy);background:#E3EDFF}
.sp-blue .btn.p{background:var(--blue);border-color:var(--blue);color:#FFFFFF;font-weight:700}
.sp-blue .btn.p:hover{background:#174FE0;color:#FFFFFF}
.sp-blue .pill{background:var(--mist);color:var(--blue);border:1px solid var(--line)}
.sp-blue .live{background:var(--blue)}
.sp-blue .lnk{color:var(--blue)}
.sp-blue .rec,.sp-blue .two > div{background:var(--mist);border-radius:12px;border:1px solid var(--line)}
.sp-blue th{color:var(--ink2);border-color:var(--line)}
.sp-blue td{border-color:var(--line)}
.sp-blue :focus-visible{outline:2px solid var(--blue);outline-offset:2px}

/* ---------- field card ---------- */
.sp-blue .sp-field{padding:0;overflow:hidden}
.sp-head{display:flex;align-items:flex-start;gap:14px;padding:22px 24px 18px}
.sp-head-ico{width:40px;height:40px;flex:none;border-radius:12px;display:grid;place-items:center;color:#070909;
  background:var(--blue);box-shadow:0 10px 20px -10px rgba(183,255,60,.4)}
.sp-head h2{margin:0;font-size:18px;display:flex;align-items:center;gap:10px}
.sp-sub{margin-top:4px;font-size:12.5px;color:var(--ink2)}
.sp-live{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;background:var(--mist);
  color:var(--blue);font:600 11px Inter,sans-serif;letter-spacing:0}
.sp-live i{width:6px;height:6px;border-radius:50%;background:var(--blue);animation:spBlink 1.8s infinite}
.sp-seg{margin-left:auto;display:flex;padding:3px;background:var(--mist);border-radius:12px}
.sp-seg button{border:0;background:transparent;color:var(--ink2);padding:8px 14px;border-radius:99px;display:flex;
  align-items:center;gap:7px;font:600 12.5px Inter,sans-serif;cursor:pointer;transition:.18s}
.sp-seg button:hover{color:var(--ink)}
.sp-seg button.on{background:var(--blue);color:#070909;font-weight:700}

.sp-strip{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.sp-stat{padding:14px 22px;border-right:1px solid var(--line);min-width:0}
.sp-stat:last-child{border-right:0}
.sp-stat span{display:block;color:var(--ink2);font-size:12px;font-weight:500}
.sp-stat strong{display:block;margin-top:3px;font:700 20px Sora,sans-serif;color:var(--ink)}
.sp-stat strong.blue{color:var(--blue)}
.sp-bar{height:4px;border-radius:9px;background:var(--mist);margin-top:8px;overflow:hidden}
.sp-bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#6C9BFF,#1F5BFF)}

.sp-stage{height:500px;position:relative;overflow:hidden}
.sp-net-stage{background:radial-gradient(ellipse at 50% 50%,#fff 0%,#F1F6FF 55%,#E4EDFF 100%)}
.sp-box{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;font-size:12px;color:var(--ink2);
  background:rgba(255,255,255,.92);border:1px solid var(--line);backdrop-filter:blur(8px);box-shadow:0 8px 20px -14px rgba(11,42,138,.5)}
.sp-box b{color:var(--ink);font-size:13px}
.sp-box svg{color:var(--blue)}
.sp-icon-btn{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;cursor:pointer;color:var(--navy);
  background:#fff;border:1px solid var(--line);box-shadow:0 8px 20px -14px rgba(11,42,138,.5)}
.sp-icon-btn:hover{color:var(--blue);border-color:var(--blue)}

.sp-empty{position:absolute;z-index:500;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;
  align-items:center;gap:6px;text-align:center;width:min(340px,calc(100% - 40px));padding:20px;border-radius:16px;
  background:rgba(255,255,255,.94);border:1px solid var(--line);color:var(--blue);box-shadow:0 20px 50px -24px rgba(11,42,138,.5)}
.sp-empty strong{color:var(--ink);font-size:14px}
.sp-empty span{color:var(--ink2);font-size:12px;line-height:1.5}

/* ---------- spider network ---------- */
.sp-net{width:100%;height:100%;display:block}
.sp-web{fill:none;stroke:#C3D5FA;stroke-width:1}
.sp-web.outer{stroke:#93B2F3;stroke-width:1.3}
.sp-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:spDraw 1.1s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:var(--d,0ms)}
.sp-ring-label{font:600 10px Inter,sans-serif;fill:#6C8BD6;paint-order:stroke;stroke:#F1F6FF;stroke-width:3px}
.sp-sweep{transform-origin:0 0;animation:spSpin 10s linear infinite}
.sp-link{fill:none;stroke:#A9C2F7;stroke-width:1;stroke-dasharray:3 4;transition:stroke .2s,opacity .2s}
.sp-link.on{stroke:var(--blue);stroke-width:1.8;stroke-dasharray:none}
.sp-spoke{fill:none;stroke:#7FA4F5;stroke-width:1.5;transition:stroke .2s,opacity .2s}
.sp-spoke.on{stroke:var(--blue);stroke-width:2.6}
.sp-pulse{fill:var(--blue);opacity:.9}
.sp-pulse.normal,.sp-pulse.medium{fill:#7FA4F5}
.sp-net.focus .sp-spoke:not(.on){opacity:.22}
.sp-net.focus .sp-link:not(.on){opacity:.2}
.sp-net.focus .sp-node:not(.on){opacity:.4}

.sp-node{cursor:pointer;outline:none;transition:opacity .2s}
.sp-pop{transform:scale(0);animation:spPop .5s cubic-bezier(.3,1.5,.5,1) forwards;animation-delay:var(--d,0ms)}
.sp-body{transition:transform .18s;transform-origin:0 0}
.sp-node:hover .sp-body,.sp-node.on .sp-body{transform:scale(1.18)}
.sp-dot{stroke-width:2.5}
.sp-halo{fill:rgba(31,91,255,.18);transform-origin:0 0;animation:spHalo 2.2s ease-out infinite}
.sp-node.normal .sp-dot{fill:#fff;stroke:var(--blue)}
.sp-node.medium .sp-dot{fill:var(--sky);stroke:var(--blue)}
.sp-node.high .sp-dot{fill:var(--blue);stroke:#fff}
.sp-node.done .sp-dot{fill:var(--navy);stroke:#fff}
.sp-glyph{fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.sp-glyph-dot{fill:#fff}
.sp-glyph-fill{fill:var(--blue)}
.sp-node.medium .sp-glyph-fill{fill:var(--navy)}
.sp-node:focus-visible .sp-dot{stroke:var(--ink);stroke-width:3.5}
.sp-label{font:600 11px Inter,sans-serif;fill:var(--ink);text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}

.sp-ripple{fill:none;stroke:var(--blue);stroke-width:1.5;transform-origin:0 0;animation:spRipple 3.6s ease-out infinite}
.sp-hub-title{font:700 14px Sora,sans-serif;fill:var(--blue);text-anchor:middle}
.sp-hub-sub{font:500 8.5px Inter,sans-serif;fill:var(--ink2);text-anchor:middle}

.sp-net-top{position:absolute;top:16px;left:16px;display:flex;gap:8px;z-index:3}
.sp-legend{position:absolute;left:16px;bottom:16px;z-index:3;display:flex;gap:14px;padding:9px 12px;border-radius:10px;
  background:rgba(255,255,255,.92);border:1px solid var(--line);backdrop-filter:blur(8px)}
.sp-legend span{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500;color:var(--ink2)}
.sp-legend i{width:10px;height:10px;border-radius:50%;display:inline-block;border:2px solid var(--blue)}
.sp-legend i.normal{background:#fff}
.sp-legend i.high{background:var(--blue)}
.sp-legend i.done{background:var(--navy);border-color:var(--navy)}

.sp-info{position:absolute;top:16px;right:16px;z-index:3;width:250px;padding:14px 16px;border-radius:14px;
  background:rgba(255,255,255,.95);border:1px solid var(--line);backdrop-filter:blur(10px);
  box-shadow:0 18px 40px -22px rgba(11,42,138,.55)}
.sp-info h3{margin:8px 0 0;font-size:15px}
.sp-info p{margin:5px 0 0;color:var(--ink2);font-size:12px;line-height:1.45}
.sp-info p.hint{margin:0}
.sp-info dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
.sp-info dl div{padding:8px 10px;border-radius:9px;background:var(--mist)}
.sp-info dt{font-size:10.5px;color:var(--ink2)}
.sp-info dd{margin:2px 0 0;font:700 14px Sora,sans-serif}
.sp-tag{display:inline-block;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600;background:var(--mist);color:var(--blue)}
.sp-tag.high{background:var(--blue);color:#fff}
.sp-tag.done{background:var(--navy);color:#fff}
.sp-link-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px;border-radius:10px;cursor:pointer;
  border:0;background:var(--blue);color:#fff;font:600 12.5px Inter,sans-serif;transition:.15s}
.sp-link-btn:hover{background:var(--navy)}

/* ---------- OSM map ---------- */
.sp-map{position:absolute;inset:0;z-index:1;background:#E7EEFB}
.sp-map .leaflet-tile-pane{filter:saturate(.55) brightness(1.02)}
.sp-map .leaflet-container{width:100%;height:100%;background:#E7EEFB;font-family:inherit}
.sp-map .leaflet-control-attribution{font-size:9px;background:rgba(255,255,255,.85);color:var(--ink2)}
.sp-map .leaflet-control-zoom{border:0!important;box-shadow:0 8px 20px -12px rgba(11,42,138,.5)!important}
.sp-map .leaflet-control-zoom a{width:34px;height:34px;line-height:32px;color:var(--navy);background:#fff;border-color:var(--line)}
.sp-map .leaflet-control-zoom a:hover{color:var(--blue);background:var(--mist)}
.sp-map-tools{position:absolute;left:16px;bottom:18px;z-index:500;display:flex;align-items:center;gap:8px}

.sp-mk-wrap{background:transparent!important;border:0!important}
.sp-mk{position:relative;width:44px;height:44px;display:grid;place-items:center}
.sp-mk-icon{position:relative;z-index:2;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
  border:2px solid #fff;box-shadow:0 6px 16px -4px rgba(11,42,138,.55)}
.sp-mk-normal .sp-mk-icon{background:#fff;color:var(--blue);border-color:var(--blue)}
.sp-mk-medium .sp-mk-icon{background:var(--sky);color:var(--navy)}
.sp-mk-high .sp-mk-icon{background:var(--blue);color:#fff}
.sp-mk-done .sp-mk-icon{background:var(--navy);color:#fff}
.sp-mk-pulse{display:none;position:absolute;width:40px;height:40px;border-radius:50%;border:2px solid rgba(31,91,255,.5);animation:spMk 2.2s ease-out infinite}
.sp-mk-high .sp-mk-pulse{display:block}

.sp-map .leaflet-popup-content-wrapper{border-radius:14px;padding:2px;box-shadow:0 18px 40px -16px rgba(11,42,138,.5)}
.sp-map .leaflet-popup-content{margin:10px 12px}
.sp-pu{min-width:200px;font-family:Inter,sans-serif}
.sp-pu-title{font:700 14px Sora,sans-serif;color:var(--ink)}
.sp-pu-addr{margin-top:4px;color:var(--ink2);font-size:11.5px;line-height:1.4}
.sp-pu-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
.sp-pu-tag{padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600;background:var(--mist);color:var(--blue)}
.sp-pu-tag.sp-pu-high{background:var(--blue);color:#fff}
.sp-pu-tag.sp-pu-done{background:var(--navy);color:#fff}
.sp-pu-coord{font-size:10.5px;color:var(--ink2)}

/* ---------- health graph ---------- */
.sp-health{margin-top:12px}
.sp-health-stats{display:flex;gap:28px;margin-bottom:14px}
.sp-health-stats span{display:block}
.sp-health-stats strong{display:block;margin-top:6px;font:700 16px Sora,sans-serif}
.sp-health-stats strong.big{font-size:26px;margin-top:2px}
.sp-health-stats strong.up{color:var(--blue)}
.sp-health-stats strong.down{color:var(--navy)}
.sp-health-plot{border-radius:12px;background:linear-gradient(180deg,#F7FAFF,#fff);border:1px solid var(--line);overflow:hidden}
.sp-health-plot svg{display:block;width:100%;height:auto}
.sp-health-foot{display:flex;align-items:center;gap:7px;margin-top:10px;color:var(--ink2);font-size:11.5px}
.sp-health-empty{min-height:280px;display:grid;place-items:center;color:var(--ink2);font-size:13px}

/* ---------- motion ---------- */
@keyframes spBlink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes spDraw{to{stroke-dashoffset:0}}
@keyframes spPop{to{transform:scale(1)}}
@keyframes spSpin{to{transform:rotate(360deg)}}
@keyframes spHalo{0%{transform:scale(.7);opacity:.9}100%{transform:scale(1.8);opacity:0}}
@keyframes spRipple{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.6);opacity:0}}
@keyframes spMk{0%{transform:scale(.7);opacity:.8}75%,100%{transform:scale(1.5);opacity:0}}

@media (prefers-reduced-motion:reduce){
  .sp-sweep,.sp-ripple,.sp-halo,.sp-live i,.sp-mk-pulse{animation:none}
  .sp-draw{animation:none;stroke-dashoffset:0}
  .sp-pop{animation:none;transform:none}
}

@media (max-width:760px){
  .sp-head{flex-direction:column}
  .sp-seg{margin-left:0;width:100%}
  .sp-seg button{flex:1;justify-content:center}
  .sp-strip{grid-template-columns:repeat(2,1fr)}
  .sp-stat:nth-child(2){border-right:0}
  .sp-stat:nth-child(-n+2){border-bottom:1px solid var(--line)}
  .sp-stage{height:440px}
  .sp-info{top:auto;bottom:16px;left:16px;right:16px;width:auto}
  .sp-legend{display:none}
}`