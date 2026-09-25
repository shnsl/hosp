import { useEffect, useState } from 'react'

function formatClock(d: Date): { label: string; iso: string } {
  const dd = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return {
    label: `${dd}.${mo} ${hh}:${mm}`,
    iso: `${d.getFullYear()}-${mo}-${dd}T${hh}:${mm}`,
  }
}

/** Canlı tarih + saat — GG.AA SS:DD */
export function LiveClock() {
  const [clock, setClock] = useState(() => formatClock(new Date()))

  useEffect(() => {
    const tick = () => setClock(formatClock(new Date()))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <time className="live-clock" dateTime={clock.iso} aria-label="Tarih ve saat">
      {clock.label}
    </time>
  )
}
