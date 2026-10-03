import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/theme'
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

const THEME_HOLD_MS = 450
const HOLD_MOVE_CANCEL_PX = 10

export function AppLayout() {
  const { toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const settingsActive = location.pathname.startsWith('/settings')
  const holdTimerRef = useRef<number | null>(null)
  const longPressedRef = useRef(false)
  const holdStartRef = useRef<{ x: number; y: number } | null>(null)

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  function onSettingsPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    longPressedRef.current = false
    holdStartRef.current = { x: e.clientX, y: e.clientY }
    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      longPressedRef.current = true
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(20)
      }
      toggleTheme()
    }, THEME_HOLD_MS)
  }

  function onSettingsPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const start = holdStartRef.current
    if (!start || holdTimerRef.current == null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > HOLD_MOVE_CANCEL_PX * HOLD_MOVE_CANCEL_PX) {
      clearHoldTimer()
    }
  }

  function onSettingsPointerEnd() {
    clearHoldTimer()
    holdStartRef.current = null
  }

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
          <NavLink to="/search" title="Ara" aria-label="Ara">
            <IconSearch />
          </NavLink>
          <NavLink to="/exceptions" title="İstisnalar" aria-label="İstisnalar">
            <IconExceptions />
          </NavLink>
          <button
            type="button"
            className={`nav-settings${settingsActive ? ' active' : ''}`}
            title="Ayarlar · basılı tut: koyu/açık"
            aria-label="Ayarlar"
            aria-current={settingsActive ? 'page' : undefined}
            onPointerDown={onSettingsPointerDown}
            onPointerMove={onSettingsPointerMove}
            onPointerUp={onSettingsPointerEnd}
            onPointerCancel={onSettingsPointerEnd}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (longPressedRef.current) {
                longPressedRef.current = false
                return
              }
              void navigate('/settings')
            }}
          >
            <IconSettings />
          </button>
          <button
            type="button"
            className="nav-refresh"
            title="Yenile"
            aria-label="Sayfayı yenile"
            onClick={() => {
              window.location.reload()
            }}
          >
            <IconRefresh />
          </button>
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
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
