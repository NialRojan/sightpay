import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Route,
  Store,
  Brain,
  Camera,
  Activity,
  Command,
  Menu,
  Smartphone,
  LogOut,
} from 'lucide-react'
import { Logo } from './ui'
import { LanguagePicker, T, useLanguage } from './Language'
import { getCurrentFse, getManagerName, getRole, signOut } from '../services/session'

const groups = [
  ['Overview', [['Operations', '/fse', LayoutDashboard]]],
  ['Field', [['Priority Queue', '/fse/queue', Route, ['/queue']], ['Merchants', '/fse/merchants', Store, ['/merchants/']], ['Mobile Copilot', '/fse/mobile', Smartphone]]],
  ['Intelligence', [['AI Audits', '/fse/audits', Brain, ['/audits/']], ['Visit Evidence', '/fse/evidence', Camera, ['/fse/visits', '/visits/']], ['Impact', '/fse/impact', Activity, ['/analytics']]]],
  ['Management', [['Command Center', '/manager', Command]]],
]

const initial = (profile) => profile?.name?.[0] ?? 'S'

function currentProfile(profile) {
  if (getRole() === 'manager') return { name: getManagerName(), role: 'Operations Manager' }

  const fse = getCurrentFse()
  if (fse) {
    return { name: fse.name, role: `Field Sales Executive${fse.territory ? ` · ${fse.territory}` : ''}` }
  }

  return profile?.name ? profile : { name: 'Not signed in', role: 'Choose a role to continue' }
}

export function Sidebar({ profile }) {
  const { t } = useLanguage()
  const user = currentProfile(profile)
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <aside className="sw-side">
      <div className="sw-brand">
        <Logo />
        <button className="sw-menu" type="button" aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          <Menu size={19} aria-hidden="true" /> <T>Menu</T>
        </button>
      </div>
      <div id="workspace-navigation" className={menuOpen ? 'sw-navigation open' : 'sw-navigation'}>
        <div className="sw-navs">
          {groups.map(([g, items]) => (
            <nav key={g} className="sw-nav">
              <div className="sw-grp">{t(g)}</div>
              {items.map(([label, to, Icon, aliases = []]) => (
                <NavLink key={to} to={to} end={to === '/fse'} onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => isActive || aliases.some((path) => path.endsWith('/') ? pathname.startsWith(path) : pathname === path || pathname.startsWith(path + '/')) ? 'active' : undefined}>
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{t(label)}</span>
                </NavLink>
              ))}
            </nav>
          ))}
        </div>

        <div className="sw-me">
          <div className="sw-av">{initial(user)}</div>
          <div>
            <b>{t(user.name)}</b>
            <span>{t(user.role)}</span>
          </div>
          <Link to="/login" className="sw-account" title={t('Switch role')} aria-label={t('Switch role')} onClick={signOut}>
            <LogOut size={17} />
          </Link>
        </div>
      </div>
    </aside>
  )
}

export function TopBar({ crumb = 'Operations' }) {
  const { t } = useLanguage()
  return (
    <header className="sw-top">
      <div className="sw-crumb"><T>Workspace</T> <span aria-hidden="true">/</span> <b>{t(crumb)}</b></div>
      <div className="sp-header-actions">
        <Link className="sw-mobile-link" to="/fse/mobile"><Smartphone size={16} aria-hidden="true" /> <T>Mobile Copilot</T></Link>
        <LanguagePicker />
      </div>
    </header>
  )
}

export default function Layout({ crumb, profile, children }) {
  return (
    <div className="sp sw">
      <Sidebar profile={profile} />
      <main className="sw-main">
        <TopBar crumb={crumb} />
        {children}
      </main>
    </div>
  )
}
