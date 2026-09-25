import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MapPin,
  Route,
  Store,
  Brain,
  Camera,
  Activity,
  Search,
  Bell,
  CalendarDays,
  Command,
  Smartphone,
} from 'lucide-react'
import { Logo } from './ui'
import { fse } from '../data/demoData'

const groups = [
  [
    'Admin / Manager Panel',
    [
      ['Operations Dashboard', '/fse', LayoutDashboard],
      ['AI Priority Queue', '/queue', Route],
      ['Merchant 360', '/merchants/m1', Store],
      ['Visit Audit / Evidence', '/visits/SP-10482', Camera],
      ['Manager Command Center', '/manager', Command],
      ['Impact Analytics', '/analytics', Activity],
    ],
  ],
  [
    'FSE Mobile Copilot',
    [
      ['FSE Experience (Mobile App)', '/fse/mobile', Smartphone],
    ],
  ],
]

export function Sidebar({ profile = fse }) {
  const nav = useNavigate()
  return (
    <aside className="side">
      <Logo />
      <div className="wsind" onClick={() => nav('/fse/mobile')} role="button">
        <i /> FSE Mobile App
      </div>
      {groups.map(([g, items]) => (
        <nav key={g} className="nav">
          <div className="grp">{g}</div>
          {items.map(([label, to, Icon]) => (
            <NavLink key={to} to={to} end={to === '/fse'}>
              <Icon size={17} strokeWidth={1.6} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      ))}
      <div className="grow" />
      <div className="me">
        <div className="av">{profile?.name?.[0] || 'A'}</div>
        <div>
          <b>{profile?.name || 'Aarav Sharma'}</b>
          <div className="mu sm">{profile?.role || 'Operations Manager'}</div>
        </div>
      </div>
    </aside>
  )
}

export const TopBar = ({ crumb = 'Operations', profile = fse }) => {
  const nav = useNavigate()
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
      <button className="ibtn notif" aria-label="Notifications">
        <Bell size={16} />
        <i />
      </button>
      <div className="av sm" onClick={() => nav('/login')} style={{ cursor: 'pointer' }}>
        {profile?.name?.[0] || 'A'}
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
