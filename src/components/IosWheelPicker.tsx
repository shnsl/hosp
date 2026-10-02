import { useEffect, useMemo, useRef, useState } from 'react'

const ITEM_H = 40
const VISIBLE = 5

type WheelItem = { value: number; label: string }

type WheelColumnProps = {
  items: WheelItem[]
  value: number
  onChange: (value: number) => void
  'aria-label'?: string
}

function nearestIndex(items: WheelItem[], value: number): number {
  const exact = items.findIndex((i) => i.value === value)
  if (exact >= 0) return exact
  let best = 0
  let bestDiff = Number.POSITIVE_INFINITY
  for (let i = 0; i < items.length; i++) {
    const d = Math.abs(items[i].value - value)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return best
}

export function WheelColumn({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
}: WheelColumnProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const endTimerRef = useRef<number | null>(null)
  const [active, setActive] = useState(() => nearestIndex(items, value))
  const pad = Math.floor(VISIBLE / 2)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const idx = nearestIndex(items, value)
    setActive(idx)
    el.scrollTop = idx * ITEM_H
  }, [value, items])

  useEffect(() => {
    return () => {
      if (endTimerRef.current != null) window.clearTimeout(endTimerRef.current)
    }
  }, [])

  function commitIndex(idx: number) {
    const clamped = Math.min(items.length - 1, Math.max(0, idx))
    setActive(clamped)
    const next = items[clamped]?.value
    if (next != null && next !== value) onChange(next)
    const el = scrollerRef.current
    if (el) {
      const target = clamped * ITEM_H
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTo({ top: target, behavior: 'smooth' })
      }
    }
  }

  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    const idx = Math.round(el.scrollTop / ITEM_H)
    setActive(Math.min(items.length - 1, Math.max(0, idx)))
    if (endTimerRef.current != null) window.clearTimeout(endTimerRef.current)
    endTimerRef.current = window.setTimeout(() => {
      commitIndex(Math.round(el.scrollTop / ITEM_H))
    }, 80)
  }

  return (
    <div className="ios-wheel-col" aria-label={ariaLabel}>
      <div className="ios-wheel-highlight" aria-hidden />
      <div
        ref={scrollerRef}
        className="ios-wheel-scroller"
        onScroll={onScroll}
      >
        <div style={{ height: pad * ITEM_H }} aria-hidden />
        {items.map((item, i) => {
          const dist = i - active
          const abs = Math.abs(dist)
          const rotate = Math.max(-55, Math.min(55, dist * 20))
          const opacity = abs === 0 ? 1 : Math.max(0.2, 1 - abs * 0.26)
          const scale = abs === 0 ? 1.05 : Math.max(0.75, 1 - abs * 0.07)
          return (
            <button
              key={item.value}
              type="button"
              className={`ios-wheel-item${i === active ? ' is-active' : ''}`}
              style={{
                height: ITEM_H,
                opacity,
                transform: `rotateX(${-rotate}deg) scale(${scale})`,
              }}
              onClick={() => commitIndex(i)}
            >
              {item.label}
            </button>
          )
        })}
        <div style={{ height: pad * ITEM_H }} aria-hidden />
      </div>
    </div>
  )
}

type DurationWheelPickerProps = {
  open: boolean
  value: number
  min?: number
  max?: number
  step?: number
  title?: string
  onChange: (value: number) => void
  onClose: () => void
}

export function DurationWheelPicker({
  open,
  value,
  min = 15,
  max = 180,
  step = 5,
  title = 'Süre (dk)',
  onChange,
  onClose,
}: DurationWheelPickerProps) {
  const items = useMemo(() => {
    const out: WheelItem[] = []
    for (let m = min; m <= max; m += step) {
      out.push({ value: m, label: String(m) })
    }
    return out
  }, [min, max, step])

  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal ios-wheel-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header ios-wheel-modal-header">
          <button className="btn ghost" type="button" onClick={onClose}>
            İptal
          </button>
          <strong>{title}</strong>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              onChange(draft)
              onClose()
            }}
          >
            Tamam
          </button>
        </header>
        <div className="ios-wheel-stage">
          <WheelColumn
            items={items}
            value={draft}
            onChange={setDraft}
            aria-label="Süre dakika"
          />
          <span className="ios-wheel-unit" aria-hidden>
            dk
          </span>
        </div>
      </div>
    </div>
  )
}

function parseHhmm(hhmm: string): { hour: number; minute: number } {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return { hour: 8, minute: 45 }
  return {
    hour: Math.min(23, Math.max(0, Number(m[1]))),
    minute: Math.min(59, Math.max(0, Number(m[2]))),
  }
}

function formatHhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

type TimeWheelPickerProps = {
  open: boolean
  value: string
  minuteStep?: number
  title?: string
  onChange: (hhmm: string) => void
  onClose: () => void
}

export function TimeWheelPicker({
  open,
  value,
  minuteStep = 5,
  title = 'Başlangıç',
  onChange,
  onClose,
}: TimeWheelPickerProps) {
  const hourItems = useMemo(() => {
    const out: WheelItem[] = []
    for (let h = 0; h <= 23; h++) {
      out.push({ value: h, label: String(h).padStart(2, '0') })
    }
    return out
  }, [])

  const minuteItems = useMemo(() => {
    const out: WheelItem[] = []
    for (let m = 0; m < 60; m += minuteStep) {
      out.push({ value: m, label: String(m).padStart(2, '0') })
    }
    return out
  }, [minuteStep])

  const parsed = parseHhmm(value)
  const snappedMinute =
    minuteItems[nearestIndex(minuteItems, parsed.minute)]?.value ?? 0

  const [hour, setHour] = useState(parsed.hour)
  const [minute, setMinute] = useState(snappedMinute)

  useEffect(() => {
    if (!open) return
    const p = parseHhmm(value)
    setHour(p.hour)
    setMinute(minuteItems[nearestIndex(minuteItems, p.minute)]?.value ?? 0)
  }, [open, value, minuteItems])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal ios-wheel-modal ios-wheel-modal-time"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header ios-wheel-modal-header">
          <button className="btn ghost" type="button" onClick={onClose}>
            İptal
          </button>
          <strong>{title}</strong>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              onChange(formatHhmm(hour, minute))
              onClose()
            }}
          >
            Tamam
          </button>
        </header>
        <div className="ios-wheel-stage">
          <WheelColumn
            items={hourItems}
            value={hour}
            onChange={setHour}
            aria-label="Saat"
          />
          <span className="ios-wheel-sep" aria-hidden>
            :
          </span>
          <WheelColumn
            items={minuteItems}
            value={minute}
            onChange={setMinute}
            aria-label="Dakika"
          />
        </div>
      </div>
    </div>
  )
}
