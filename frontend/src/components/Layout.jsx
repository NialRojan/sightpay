import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Route,
  Store,
  Camera,
  Activity,
  Search,
  Bell,
  CalendarDays,
  Command,
  Smartphone,
  LogOut,
} from 'lucide-react'
import { Logo } from './ui'
import { getCurrentFse, getManagerName, getRole, signOut } from '../services/session'

// Sidebar entries per role: [label, route, icon, extra path prefixes that should also highlight the entry].
// Merchant 360 / Visit Audit go through the redirects in Redirects.jsx, which resolve to real numeric ids.
const MANAGER_GROUPS = [
  [
    'Admin / Manager Panel',
    [
      ['Operations Dashboard', '/fse', LayoutDashboard],
      ['AI Priority Queue', '/queue', Route],
      ['Merchant 360', '/fse/merchants', Store, ['/merchants/']],
      ['Visit Audit / Evidence', '/fse/visits', Camera, ['/visits/', '/fse/visits/', '/audits/', '/fse/audits']],
      ['Manager Command Center', '/manager', Command],
      ['Impact Analytics', '/analytics', Activity],
    ],
  ],
  ['FSE Mobile Copilot', [['FSE Experience (Mobile App)', '/fse/mobile', Smartphone]]],
]

const FSE_GROUPS = [
  [
    'Field Rep Workspace',
    [
      ['My Dashboard', '/fse', LayoutDashboard],
      ['My Priority Queue', '/fse/queue', Route, ['/queue']],
      ['Merchant 360', '/fse/merchants', Store, ['/merchants/']],
      ['My Visit Evidence', '/fse/visits', Camera, ['/visits/', '/fse/visits/', '/audits/', '/fse/audits']],
      ['Impact Analytics', '/fse/impact', Activity, ['/analytics']],
    ],
  ],
  ['FSE Mobile Copilot', [['FSE Experience (Mobile App)', '/fse/mobile', Smartphone]]],
]

// Who is signed in (Login.jsx stores it; no backend auth). Falls back to the page-supplied profile.
function currentUser(profile) {
  if (getRole() === 'manager') {
    return { role: 'manager', name: getManagerName(), sub: 'Operations Manager' }
  }
  const fse = getCurrentFse()
  if (fse) return { role: 'fse', name: fse.name, sub: `Field Sales Executive${fse.territory ? ` · ${fse.territory}` : ''}` }
  if (profile?.name) return { role: 'fse', name: profile.name, sub: profile.role || 'Field Sales Executive' }
  return { role: 'guest', name: 'Not signed in', sub: 'Choose a role to continue' }
}

export function Sidebar({ profile }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const user = currentUser(profile)
  const groups = user.role === 'manager' ? MANAGER_GROUPS : FSE_GROUPS

  const logout = () => {
    signOut()
    nav('/login')
  }

  return (
    <aside className="side">
      <Logo />
      <div className="wsind" onClick={() => nav('/fse/mobile')} role="button">
        <i /> FSE Mobile App
      </div>
      {groups.map(([g, items]) => (
        <nav key={g} className="nav">
          <div className="grp">{g}</div>
          {items.map(([label, to, Icon, also = []]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/fse'}
              className={({ isActive }) => (isActive || also.some((p) => pathname.startsWith(p)) ? 'active' : '')}
            >
              <Icon size={17} strokeWidth={1.6} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      ))}
      <div className="grow" />
      <div className="me">
        <div className="av">{user.name?.[0] || '?'}</div>
        <div>
          <b>{user.name}</b>
          <div className="mu sm">{user.sub}</div>
        </div>
      </div>
      <div className="wsind" onClick={logout} role="button" title="Sign out and pick another role">
        <LogOut size={13} /> {user.role === 'guest' ? 'Sign in' : 'Log out / switch role'}
      </div>
    </aside>
  )
}

export const TopBar = ({ crumb = 'Operations', profile }) => {
  const nav = useNavigate()
  const user = currentUser(profile)
  return (
    <header className="top">
      <div className="mu sm">
        SightPay / <span className="tx" style={{ color: '#0A1B3D', fontWeight: 600 }}>{crumb}</span>
      </div>
      <div className="grow" />
      <button className="btn sm" onClick={() => nav('/fse/mobile')} style={{ padding: '4px 12px', fontSize: 11 }}>
        <Smartphone size={13} color="#1F5BFF" /> Launch FSE Mobile App
      </button>
      <label className="search">
        <Search size={15} />
        <input placeholder="Search merchants, visits..." aria-label="Search" />
      </label>
      <button className="ibtn" aria-label="Date">
        <CalendarDays size={16} />
      </button>
      <button
        className="ibtn notif"
        aria-label="Open escalations"
        title="Open escalations (Manager Command Center)"
        onClick={() => nav('/manager')}
      >
        <Bell size={16} />
        <i />
      </button>
      <div
        className="av sm"
        onClick={() => nav('/login')}
        style={{ cursor: 'pointer' }}
        title={`${user.name} · ${user.sub} (switch role)`}
      >
        {user.name?.[0] || '?'}
      </div>
    </header>
  )
}

export default function Layout({ crumb, profile, children }) {
  return (
    <div className="sp shell">
      <Sidebar profile={profile} />
      <main className="main">
        <TopBar crumb={crumb} profile={profile} />
        {children}
      </main>
    </div>
  )
}
