import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  IconAgenda,
  IconExceptions,
  IconPatients,
  IconSettings,
  IconWeek,
} from './Icons'

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="AJAN">
          <span className="brand-mark">A</span>
          AJAN
        </Link>
        <nav className="nav" aria-label="Ana menü">
          <NavLink to="/" end title="Günlük plan" aria-label="Günlük plan">
            <IconAgenda />
          </NavLink>
          <NavLink to="/week" title="Haftalık plan" aria-label="Haftalık plan">
            <IconWeek />
          </NavLink>
          <NavLink to="/patients" title="Hastalar" aria-label="Hastalar">
            <IconPatients />
          </NavLink>
          <NavLink to="/exceptions" title="İstisnalar" aria-label="İstisnalar">
            <IconExceptions />
          </NavLink>
          <NavLink to="/settings" title="Ayarlar" aria-label="Ayarlar">
            <IconSettings />
          </NavLink>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
