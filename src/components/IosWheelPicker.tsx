import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  FILE_SELECT_OPTIONS,
  maxSessionFor,
  parseFileSelect,
} from '../lib/sessionMeta'

const ITEM_H = 40
const VISIBLE = 5
const LOOP_COPIES = 3

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

function wrapIndex(idx: number, len: number): number {
  if (len <= 0) return 0
  return ((idx % len) + len) % len
}

function toMiddleCopy(absIdx: number, len: number): number {
  return len + wrapIndex(absIdx, len)
}

export function WheelColumn({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
}: WheelColumnProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const endTimerRef = useRef<number | null>(null)
  const recenterTimerRef = useRef<number | null>(null)
  const unlockTimerRef = useRef<number | null>(null)
  const suppressScrollRef = useRef(false)
  const programScrollRef = useRef(false)
  const valueRef = useRef(value)
  const itemsRef = useRef(items)
  const onChangeRef = useRef(onChange)
  const n = items.length
  const initialAbs = n > 0 ? toMiddleCopy(nearestIndex(items, value), n) : 0
  const activeRef = useRef(initialAbs)
  const wheelLockRef = useRef(false)
  const [active, setActive] = useState(initialAbs)
  const pad = Math.floor(VISIBLE / 2)

  const loopItems = useMemo(() => {
    if (n === 0) return [] as Array<WheelItem & { loopKey: string }>
    const out: Array<WheelItem & { loopKey: string }> = []
    for (let copy = 0; copy < LOOP_COPIES; copy++) {
      for (let i = 0; i < n; i++) {
        const item = items[i]
        out.push({ ...item, loopKey: `${copy}-${i}-${item.value}-${item.label}` })
      }
    }
    return out
  }, [items, n])

  valueRef.current = value
  itemsRef.current = items
  onChangeRef.current = onChange

  function setActiveIndex(idx: number) {
    activeRef.current = idx
    setActive(idx)
  }

  function lockProgramScroll(ms: number) {
    programScrollRef.current = true
    if (endTimerRef.current != null) {
      window.clearTimeout(endTimerRef.current)
      endTimerRef.current = null
    }
    if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
    unlockTimerRef.current = window.setTimeout(() => {
      programScrollRef.current = false
    }, ms)
  }

  function jumpToAbs(absIdx: number) {
    const el = scrollerRef.current
    if (!el) return
    suppressScrollRef.current = true
    el.scrollTop = absIdx * ITEM_H
    setActiveIndex(absIdx)
    requestAnimationFrame(() => {
      suppressScrollRef.current = false
    })
  }

  function emitLogical(logicalIdx: number) {
    const list = itemsRef.current
    const len = list.length
    if (len <= 0) return -1
    const logical = wrapIndex(logicalIdx, len)
    const next = list[logical]?.value
    if (next != null && next !== valueRef.current) onChangeRef.current(next)
    return logical
  }

  function recenterToMiddle(absIdx: number) {
    const len = itemsRef.current.length
    if (len <= 0) return
    const mid = toMiddleCopy(absIdx, len)
    if (mid === absIdx) {
      setActiveIndex(absIdx)
      return
    }
    jumpToAbs(mid)
  }

  /** Tıklama / oturunca: her zaman orta kopyaya yaz (ara kare yok). */
  function commitLogical(logicalIdx: number, smooth = true) {
    const list = itemsRef.current
    const len = list.length
    if (len <= 0) return
    const logical = emitLogical(logicalIdx)
    if (logical < 0) return
    const abs = toMiddleCopy(logical, len)
    setActiveIndex(abs)

    const el = scrollerRef.current
    if (!el) return
    const target = abs * ITEM_H
    const delta = Math.abs(el.scrollTop - target)
    if (delta <= 1) return

    if (!smooth || delta > ITEM_H * 1.5) {
      lockProgramScroll(140)
      jumpToAbs(abs)
      return
    }

    lockProgramScroll(280)
    el.scrollTo({ top: target, behavior: 'smooth' })
  }

  /** Tekerlek: bir adım (döngüde komşu kopyaya geçip sonra ortala). */
  function commitStep(dir: 1 | -1) {
    const len = itemsRef.current.length
    if (len <= 0) return
    let from = activeRef.current
    const mid = toMiddleCopy(from, len)
    if (from !== mid) {
      jumpToAbs(mid)
      from = mid
    }
    const nextAbs = from + dir
    const logical = emitLogical(nextAbs)
    if (logical < 0) return
    setActiveIndex(nextAbs)

    const el = scrollerRef.current
    if (!el) return
    lockProgramScroll(300)
    el.scrollTo({ top: nextAbs * ITEM_H, behavior: 'smooth' })
    if (recenterTimerRef.current != null) window.clearTimeout(recenterTimerRef.current)
    recenterTimerRef.current = window.setTimeout(() => {
      recenterToMiddle(nextAbs)
    }, 220)
  }

  // Açılışta active orta kopyada olsa bile scrollTop 0 kalabiliyor; her zaman hizala.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el || n <= 0) return
    const logical = nearestIndex(items, value)
    const abs = toMiddleCopy(logical, n)
    setActiveIndex(abs)
    const target = abs * ITEM_H
    if (Math.abs(el.scrollTop - target) > 1) {
      lockProgramScroll(120)
      suppressScrollRef.current = true
      el.scrollTop = target
      requestAnimationFrame(() => {
        suppressScrollRef.current = false
      })
    }
  }, [value, items, n])

  useEffect(() => {
    return () => {
      if (endTimerRef.current != null) window.clearTimeout(endTimerRef.current)
      if (recenterTimerRef.current != null) window.clearTimeout(recenterTimerRef.current)
      if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (wheelLockRef.current || n <= 0) return
      if (e.deltaY === 0 && e.deltaX === 0) return
      const dir = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0 ? 1 : -1
      wheelLockRef.current = true
      commitStep(dir === 1 ? 1 : -1)
      window.setTimeout(() => {
        wheelLockRef.current = false
      }, 100)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [n])

  function onScroll() {
    const el = scrollerRef.current
    if (!el || suppressScrollRef.current || programScrollRef.current || n <= 0) return
    if (wheelLockRef.current) return
    const total = n * LOOP_COPIES
    const idx = Math.min(total - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)))
    setActiveIndex(idx)
    if (endTimerRef.current != null) window.clearTimeout(endTimerRef.current)
    endTimerRef.current = window.setTimeout(() => {
      if (programScrollRef.current) return
      const settled = Math.round(el.scrollTop / ITEM_H)
      commitLogical(wrapIndex(settled, n), false)
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
        {loopItems.map((item, i) => {
          const dist = i - active
          const absDist = Math.abs(dist)
          const rotate = Math.max(-55, Math.min(55, dist * 20))
          const opacity = absDist === 0 ? 1 : Math.max(0.2, 1 - absDist * 0.26)
          const scale = absDist === 0 ? 1.05 : Math.max(0.75, 1 - absDist * 0.07)
          return (
            <button
              key={item.loopKey}
              type="button"
              className={`ios-wheel-item${i === active ? ' is-active' : ''}`}
              style={{
                height: ITEM_H,
                opacity,
                transform: `rotateX(${-rotate}deg) scale(${scale})`,
              }}
              onClick={() => commitLogical(wrapIndex(i, n), true)}
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

type FileSessionWheelPanelProps = {
  fileValue: string
  sessionValue: string
  onFileChange: (fileSelect: string) => void
  onSessionChange: (sessionNo: string) => void
}

/** Liste ekranı: dosya + seans iOS tekerlek paneli (gömülü) */
export function FileSessionWheelPanel({
  fileValue,
  sessionValue,
  onFileChange,
  onSessionChange,
}: FileSessionWheelPanelProps) {
  const fileItems = useMemo(() => {
    const out: WheelItem[] = [{ value: 0, label: '—' }]
    FILE_SELECT_OPTIONS.forEach((o, i) => {
      out.push({ value: i + 1, label: o.label })
    })
    return out
  }, [])

  const fileIndex = useMemo(() => {
    if (!fileValue) return 0
    const idx = FILE_SELECT_OPTIONS.findIndex((o) => o.value === fileValue)
    return idx >= 0 ? idx + 1 : 0
  }, [fileValue])

  const parsedFile = parseFileSelect(fileValue)
  const sessionMax = maxSessionFor(parsedFile?.fileHalf ?? null)

  const sessionItems = useMemo(() => {
    const out: WheelItem[] = []
    for (let n = 0; n <= sessionMax; n++) {
      out.push({ value: n, label: String(n) })
    }
    return out
  }, [sessionMax])

  const sessionNum = sessionValue === '' ? 0 : Number(sessionValue)
  const sessionSafe = Number.isFinite(sessionNum)
    ? Math.min(sessionMax, Math.max(0, sessionNum))
    : 0

  return (
    <div className="ios-wheel-stage ios-wheel-stage-embedded">
      <div className="ios-wheel-col-wrap">
        <span className="ios-wheel-col-label">Dosya</span>
        <WheelColumn
          items={fileItems}
          value={fileIndex}
          onChange={(idx) => {
            if (idx <= 0) {
              onFileChange('')
              onSessionChange('')
              return
            }
            const opt = FILE_SELECT_OPTIONS[idx - 1]
            if (!opt) return
            onFileChange(opt.value)
            const half = parseFileSelect(opt.value)?.fileHalf ?? null
            const max = maxSessionFor(half)
            if (sessionValue !== '' && Number(sessionValue) > max) {
              onSessionChange(String(max))
            } else if (sessionValue === '') {
              onSessionChange('0')
            }
          }}
          aria-label="Kaçıncı dosya"
        />
      </div>
      <div className="ios-wheel-col-wrap">
        <span className="ios-wheel-col-label">Seans</span>
        <WheelColumn
          items={sessionItems}
          value={sessionSafe}
          onChange={(n) => onSessionChange(String(n))}
          aria-label="Kaçıncı seans"
        />
      </div>
    </div>
  )
}
