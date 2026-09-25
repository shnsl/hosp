import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  IconAgenda,
  IconExceptions,
  IconPatients,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTracking,
  IconWeek,
} from './Icons'
import { LiveClock } from './LiveClock'

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-with-clock">
          <Link to="/" className="brand" aria-label="AJAN">
            <img
              className="brand-mark"
              src={`${import.meta.env.BASE_URL}pwa-192.png`}
              alt=""
              width={28}
              height={28}
            />
            <span className="brand-text">
              <span className="brand-name">AJAN</span>
              <LiveClock />
            </span>
          </Link>
        </div>
        <nav className="nav" aria-label="Ana menü">
          <NavLink to="/" end title="Günlük Plan" aria-label="Günlük Plan">
            <IconAgenda />
          </NavLink>
          <NavLink to="/week" title="Haftalık Plan" aria-label="Haftalık Plan">
            <IconWeek />
          </NavLink>
          <NavLink to="/patients" title="Hastalar" aria-label="Hastalar">
            <IconPatients />
          </NavLink>
          <NavLink to="/tracking" title="Özet" aria-label="Özet">
            <IconTracking />
          </NavLink>
          <NavLink to="/search" title="Ara" aria-label="Ara">
            <IconSearch />
          </NavLink>
          <NavLink to="/exceptions" title="İstisnalar" aria-label="İstisnalar">
            <IconExceptions />
          </NavLink>
          <NavLink to="/settings" title="Ayarlar" aria-label="Ayarlar">
            <IconSettings />
          </NavLink>
          <button
            type="button"
            className="nav-refresh"
            title="Yenile"
            aria-label="Sayfayı yenile"
            onClick={() => window.location.reload()}
          >
            <IconRefresh />
          </button>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
