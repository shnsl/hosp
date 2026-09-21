import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const NAV_SWIPE_ROUTES = ['/', '/agenda', '/patients', '/settings'] as const

const SWIPE_MIN_PX = 64
const SWIPE_RATIO = 1.25

function isSwipeBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [data-no-swipe]',
    ),
  )
}

export function useNavSwipe(enabled = true) {
  const navigate = useNavigate()
  const location = useLocation()
  const startRef = useRef<{
    x: number
    y: number
    target: EventTarget | null
  } | null>(null)

  useEffect(() => {
    if (!enabled) return

    const routeIndex = NAV_SWIPE_ROUTES.indexOf(
      location.pathname as (typeof NAV_SWIPE_ROUTES)[number],
    )
    if (routeIndex < 0) return

    const mq = window.matchMedia('(max-width: 860px)')
    if (!mq.matches) return

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        startRef.current = null
        return
      }
      const t = e.touches[0]
      startRef.current = {
        x: t.clientX,
        y: t.clientY,
        target: e.target,
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const start = startRef.current
      startRef.current = null
      if (!start || e.changedTouches.length === 0) return
      if (isSwipeBlocked(start.target)) return

      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y

      if (Math.abs(dx) < SWIPE_MIN_PX) return
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return

      const idx = NAV_SWIPE_ROUTES.indexOf(
        location.pathname as (typeof NAV_SWIPE_ROUTES)[number],
      )
      if (idx < 0) return

      if (dx < 0 && idx < NAV_SWIPE_ROUTES.length - 1) {
        navigate(NAV_SWIPE_ROUTES[idx + 1])
      } else if (dx > 0 && idx > 0) {
        navigate(NAV_SWIPE_ROUTES[idx - 1])
      }
    }

    function onTouchCancel() {
      startRef.current = null
    }

    const opts: AddEventListenerOptions = { passive: true }
    document.addEventListener('touchstart', onTouchStart, opts)
    document.addEventListener('touchend', onTouchEnd, opts)
    document.addEventListener('touchcancel', onTouchCancel, opts)

    return () => {
      document.removeEventListener('touchstart', onTouchStart, opts)
      document.removeEventListener('touchend', onTouchEnd, opts)
      document.removeEventListener('touchcancel', onTouchCancel, opts)
    }
  }, [enabled, location.pathname, navigate])
}
