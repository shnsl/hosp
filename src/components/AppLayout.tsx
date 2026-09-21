import { Link, NavLink, Outlet } from 'react-router-dom'
import { useNavSwipe } from '../lib/useNavSwipe'
import { IconAgenda, IconPatients, IconSettings, IconToday } from './Icons'

export function AppLayout() {
  useNavSwipe()

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">A</span>
          AJAN
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            <IconToday />
            Bugün
          </NavLink>
          <NavLink to="/agenda">
            <IconAgenda />
            Plan
          </NavLink>
          <NavLink to="/patients">
            <IconPatients />
            Hastalar
          </NavLink>
          <NavLink to="/settings">
            <IconSettings />
            Ayarlar
          </NavLink>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
