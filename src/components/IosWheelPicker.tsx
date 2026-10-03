import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  FILE_SELECT_OPTIONS,
  maxSessionFor,
  parseFileSelect,
} from '../lib/sessionMeta'

type WheelItem = { value: number; label: string }

export type WheelOption = {
  value: string
  label: string
}

const DEFAULT_ITEM_H = 40
/** Sonsuz döngü için seçenek listesi kopya sayısı (ortadaki bantta kalınır) */
const LOOP_COPIES = 3

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function mod(n: number, m: number) {
  if (m <= 0) return 0
  return ((n % m) + m) % m
}

function readItemH(root: HTMLElement) {
  const item = root.querySelector<HTMLElement>('.wheel-item')
  if (item && item.offsetHeight > 0) return item.offsetHeight
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;height:var(--item-h)'
  root.appendChild(probe)
  const h = probe.offsetHeight
  probe.remove()
  return h > 0 ? h : DEFAULT_ITEM_H
}

function scrollTopForVisual(
  scroller: HTMLElement,
  visual: number,
  fallbackStep: number,
) {
  const items = scroller.querySelectorAll<HTMLElement>('.wheel-item')
  const target = items[visual]
  if (target) {
    return Math.round(
      target.offsetTop - (scroller.clientHeight - target.offsetHeight) / 2,
    )
  }
  return Math.round(visual * fallbackStep)
}

function nearestVisual(scroller: HTMLElement, fallbackStep: number, maxVis: number) {
  const items = scroller.querySelectorAll<HTMLElement>('.wheel-item')
  if (items.length === 0) {
    return clamp(Math.round(scroller.scrollTop / fallbackStep), 0, maxVis)
  }
  const viewCenter = scroller.scrollTop + scroller.clientHeight / 2
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!
    const center = item.offsetTop + item.offsetHeight / 2
    const d = Math.abs(center - viewCenter)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return clamp(best, 0, maxVis)
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

/** Farm ile aynı tekerlek sütunu (string seçenekler) */
export function WheelColumnString({
  options,
  value,
  onChange,
  loop = true,
}: {
  options: WheelOption[]
  value: string
  onChange: (value: string) => void
  loop?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const itemHRef = useRef(DEFAULT_ITEM_H)
  const suppressScrollRef = useRef(false)
  const suppressTimerRef = useRef(0)
  const touchActiveRef = useRef(false)
  const interactingRef = useRef(false)
  const [pad, setPad] = useState(2)
  const [itemH, setItemH] = useState(DEFAULT_ITEM_H)
  const looping = loop && options.length > 1
  const loopingRef = useRef(looping)
  loopingRef.current = looping
  const midBase = Math.floor(LOOP_COPIES / 2) * options.length
  const midBaseRef = useRef(midBase)
  midBaseRef.current = midBase
  const found = options.findIndex((o) => o.value === value)
  const index = found >= 0 ? found : 0
  const indexRef = useRef(index)
  indexRef.current = index
  const optionsRef = useRef(options)
  optionsRef.current = options
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [paintIndex, setPaintIndex] = useState(index)
  const paintIndexRef = useRef(paintIndex)
  paintIndexRef.current = paintIndex
  const [paintVisual, setPaintVisual] = useState(() =>
    looping ? midBase + index : index,
  )
  const paintVisualRef = useRef(paintVisual)
  paintVisualRef.current = paintVisual

  const renderOptions = useMemo(() => {
    if (!looping) return options.map((opt, i) => ({ opt, visual: i }))
    const list: Array<{ opt: WheelOption; visual: number }> = []
    for (let c = 0; c < LOOP_COPIES; c += 1) {
      for (let i = 0; i < options.length; i += 1) {
        list.push({ opt: options[i]!, visual: c * options.length + i })
      }
    }
    return list
  }, [looping, options])

  const scrollToVisual = useCallback(
    (visual: number, behavior: ScrollBehavior = 'smooth') => {
      const el = scrollerRef.current
      if (!el) return
      const step = itemHRef.current || DEFAULT_ITEM_H
      const top = scrollTopForVisual(el, visual, step)
      suppressScrollRef.current = true
      window.clearTimeout(suppressTimerRef.current)
      if (behavior === 'auto') el.scrollTop = top
      else el.scrollTo({ top, behavior })
      suppressTimerRef.current = window.setTimeout(
        () => {
          const again = scrollTopForVisual(el, visual, step)
          if (Math.abs(el.scrollTop - again) > 0.5) el.scrollTop = again
          suppressScrollRef.current = false
        },
        behavior === 'auto' ? 60 : 180,
      )
    },
    [],
  )

  const expectedVisual = useCallback((logical: number) => {
    const n = optionsRef.current.length
    if (n <= 0) return 0
    const i = mod(logical, n)
    return loopingRef.current ? midBaseRef.current + i : i
  }, [])

  const syncScrollToValue = useCallback(
    (force = false) => {
      if (!force && (touchActiveRef.current || interactingRef.current)) return
      const root = rootRef.current
      const el = scrollerRef.current
      const n = optionsRef.current.length
      if (!el || n <= 0) return
      if (root) {
        const measured = readItemH(root)
        if (measured > 0) itemHRef.current = measured
      }
      const logical = mod(indexRef.current, n)
      const target = expectedVisual(logical)
      const step = itemHRef.current || DEFAULT_ITEM_H
      const ideal = scrollTopForVisual(el, target, step)
      setPaintIndex(logical)
      setPaintVisual(target)
      if (Math.abs(el.scrollTop - ideal) < 1.5) return
      scrollToVisual(target, 'auto')
    },
    [expectedVisual, scrollToVisual],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    function measure() {
      const h = root!.clientHeight
      const nextItemH = readItemH(root!)
      itemHRef.current = nextItemH
      setItemH(nextItemH)
      const visible = Math.max(3, Math.floor(h / nextItemH))
      const odd = visible % 2 === 0 ? visible - 1 : visible
      setPad(Math.max(1, Math.floor(odd / 2)))
    }
    measure()
    const ro = new ResizeObserver(() => {
      measure()
      syncScrollToValue(true)
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [syncScrollToValue])

  useLayoutEffect(() => {
    setPaintIndex(index)
    setPaintVisual(looping ? midBase + index : index)
    syncScrollToValue()
  }, [index, options.length, pad, itemH, looping, midBase, syncScrollToValue])

  useEffect(() => {
    const t1 = window.setTimeout(() => syncScrollToValue(true), 50)
    const t2 = window.setTimeout(() => syncScrollToValue(true), 280)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [options.length, looping, syncScrollToValue])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    let frame = 0
    let settleTimer = 0
    let idleRaf = 0
    let correctRaf = 0
    let wheelAcc = 0
    let wheelLock = false
    let wheelUnlockTimer = 0
    let releaseVelocity = 0
    let liveVelocity = 0
    let dragging = false
    let dragStartY = 0
    let dragStartScroll = 0
    let lastTouchY = 0
    let lastTouchT = 0
    let velSamples: number[] = []

    function maxVisual() {
      const n = optionsRef.current.length
      return loopingRef.current
        ? Math.max(0, LOOP_COPIES * n - 1)
        : Math.max(0, n - 1)
    }

    function visualFromScroll() {
      const step = itemHRef.current || DEFAULT_ITEM_H
      return nearestVisual(el!, step, maxVisual())
    }

    function targetVisualFromVelocity(velPxPerMs: number) {
      const step = itemHRef.current || DEFAULT_ITEM_H
      let visual = nearestVisual(el!, step, maxVisual())
      const abs = Math.abs(velPxPerMs)
      if (abs > 0.35) {
        const extra = Math.round((velPxPerMs * (abs > 1 ? 140 : 90)) / step)
        visual = clamp(visual + extra, 0, maxVisual())
      }
      return visual
    }

    function logicalFromVisual(visual: number) {
      const n = optionsRef.current.length
      if (n <= 0) return 0
      return mod(visual, n)
    }

    function commitLogical(logical: number) {
      const val = optionsRef.current[logical]?.value
      if (val !== undefined && val !== optionsRef.current[indexRef.current]?.value) {
        onChangeRef.current(val)
      }
      indexRef.current = logical
      setPaintIndex(logical)
    }

    function paintFromScroll() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (suppressScrollRef.current && !dragging) return
        const visual = visualFromScroll()
        const logical = logicalFromVisual(visual)
        if (logical !== paintIndexRef.current) setPaintIndex(logical)
        if (visual !== paintVisualRef.current) setPaintVisual(visual)
      })
    }

    function snapHard(visual: number) {
      const root = rootRef.current
      if (root) {
        const measured = readItemH(root)
        if (measured > 0) itemHRef.current = measured
      }
      const step = itemHRef.current || DEFAULT_ITEM_H
      suppressScrollRef.current = true
      window.clearTimeout(suppressTimerRef.current)
      window.cancelAnimationFrame(correctRaf)

      el!.style.overflowY = 'hidden'
      const apply = () => {
        el!.scrollTop = scrollTopForVisual(el!, visual, step)
      }
      apply()

      let frames = 0
      const maxFrames = 16
      function correct() {
        apply()
        frames += 1
        if (frames < maxFrames) {
          correctRaf = window.requestAnimationFrame(correct)
          return
        }
        apply()
        suppressTimerRef.current = window.setTimeout(() => {
          apply()
          el!.style.overflowY = ''
          const ideal = scrollTopForVisual(el!, visual, step)
          if (Math.abs(el!.scrollTop - ideal) > 0.5) {
            el!.style.overflowY = 'hidden'
            el!.scrollTop = ideal
            window.setTimeout(() => {
              el!.scrollTop = ideal
              el!.style.overflowY = ''
              suppressScrollRef.current = false
              interactingRef.current = false
            }, 40)
            return
          }
          suppressScrollRef.current = false
          interactingRef.current = false
        }, 100)
      }
      correctRaf = window.requestAnimationFrame(correct)
    }

    function settle(vel = releaseVelocity) {
      if (touchActiveRef.current) return
      const n = optionsRef.current.length
      if (n <= 0) return
      const approx = targetVisualFromVelocity(vel)
      const logical = logicalFromVisual(approx)
      const visual = loopingRef.current ? midBaseRef.current + logical : approx
      releaseVelocity = 0
      setPaintVisual(visual)
      snapHard(visual)
      commitLogical(logical)
    }

    function cancelIdleWatch() {
      window.clearTimeout(settleTimer)
      window.cancelAnimationFrame(idleRaf)
    }

    function waitIdleThenSettle() {
      if (dragging) return
      cancelIdleWatch()
      let lastTop = el!.scrollTop
      let stableFrames = 0
      const started = performance.now()

      function tick() {
        if (touchActiveRef.current || dragging) return
        const now = performance.now()
        const top = el!.scrollTop
        if (Math.abs(top - lastTop) < 0.5) stableFrames += 1
        else {
          stableFrames = 0
          lastTop = top
        }
        if (stableFrames >= 4 || now - started > 500) {
          settle(0)
          return
        }
        idleRaf = window.requestAnimationFrame(tick)
      }

      settleTimer = window.setTimeout(() => {
        lastTop = el!.scrollTop
        idleRaf = window.requestAnimationFrame(tick)
      }, 48)
    }

    function onScroll() {
      if (suppressScrollRef.current || dragging) return
      interactingRef.current = true
      paintFromScroll()
      if (!touchActiveRef.current) waitIdleThenSettle()
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      touchActiveRef.current = true
      interactingRef.current = true
      dragging = true
      cancelIdleWatch()
      window.cancelAnimationFrame(correctRaf)
      window.clearTimeout(suppressTimerRef.current)
      suppressScrollRef.current = false
      el!.style.overflowY = 'hidden'

      dragStartY = t.clientY
      dragStartScroll = el!.scrollTop
      lastTouchY = t.clientY
      lastTouchT = performance.now()
      liveVelocity = 0
      releaseVelocity = 0
      velSamples = []
    }

    function onTouchMove(e: TouchEvent) {
      if (!dragging || e.touches.length !== 1) return
      e.preventDefault()
      const t = e.touches[0]!
      const now = performance.now()
      const y = t.clientY
      const dt = Math.max(1, now - lastTouchT)
      const instant = (lastTouchY - y) / dt
      velSamples.push(instant)
      if (velSamples.length > 5) velSamples.shift()
      liveVelocity = velSamples.reduce((a, b) => a + b, 0) / velSamples.length
      lastTouchY = y
      lastTouchT = now

      const step = itemHRef.current || DEFAULT_ITEM_H
      const maxTop = scrollTopForVisual(el!, maxVisual(), step)
      el!.scrollTop = clamp(dragStartScroll + (dragStartY - y), 0, Math.max(0, maxTop))
      paintFromScroll()
    }

    function onTouchEnd() {
      if (!dragging) {
        touchActiveRef.current = false
        return
      }
      dragging = false
      releaseVelocity = liveVelocity
      touchActiveRef.current = false
      settle(releaseVelocity)
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (wheelLock) return

      wheelAcc += e.deltaY
      if (Math.abs(wheelAcc) < 8) return

      const dir = wheelAcc > 0 ? 1 : -1
      wheelAcc = 0
      wheelLock = true
      window.clearTimeout(wheelUnlockTimer)
      wheelUnlockTimer = window.setTimeout(() => {
        wheelLock = false
      }, 90)

      const n = optionsRef.current.length
      if (n <= 0) return
      const next = loopingRef.current
        ? mod(indexRef.current + dir, n)
        : clamp(indexRef.current + dir, 0, n - 1)
      commitLogical(next)
      const target = expectedVisual(next)
      setPaintVisual(target)
      scrollToVisual(target, 'smooth')
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(idleRaf)
      window.cancelAnimationFrame(correctRaf)
      window.clearTimeout(settleTimer)
      window.clearTimeout(wheelUnlockTimer)
      window.clearTimeout(suppressTimerRef.current)
      el.style.overflowY = ''
    }
  }, [expectedVisual, scrollToVisual])

  return (
    <div ref={rootRef} className="wheel-column">
      <div className="wheel-column-mask" aria-hidden />
      <div className="wheel-column-highlight" aria-hidden />
      <div ref={scrollerRef} className="wheel-column-scroller" data-no-swipe>
        <div style={{ height: pad * itemH }} aria-hidden />
        {renderOptions.map(({ opt, visual }) => {
          const dist = Math.abs(visual - paintVisual)
          const scale = clamp(1 - dist * 0.12, 0.72, 1)
          const opacity = clamp(1 - dist * 0.28, 0.22, 1)
          const rotate = clamp(dist * 18, 0, 54)
          const active = visual === paintVisual
          return (
            <div
              key={`${opt.value}-${visual}`}
              role="option"
              aria-selected={active}
              className={`wheel-item${active ? ' is-active' : ''}`}
              style={{
                transform: `translateZ(0) scale(${scale}) rotateX(${visual < paintVisual ? rotate : -rotate}deg)`,
                opacity,
              }}
              onClick={() => {
                if (touchActiveRef.current) return
                const logical = looping ? mod(visual, options.length) : visual
                const target = expectedVisual(logical)
                onChange(opt.value)
                indexRef.current = logical
                setPaintIndex(logical)
                setPaintVisual(target)
                scrollToVisual(target, 'smooth')
              }}
            >
              {opt.label}
            </div>
          )
        })}
        <div style={{ height: pad * itemH }} aria-hidden />
      </div>
    </div>
  )
}

/** Sayısal API — mevcut paneller için */
export function WheelColumn({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
  loop = true,
}: {
  items: WheelItem[]
  value: number
  onChange: (value: number) => void
  'aria-label'?: string
  loop?: boolean
}) {
  const options = useMemo(
    () => items.map((i) => ({ value: String(i.value), label: i.label })),
    [items],
  )
  return (
    <div aria-label={ariaLabel}>
      <WheelColumnString
        options={options}
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        loop={loop}
      />
    </div>
  )
}

export function WheelPickerShell({
  open,
  title,
  onCancel,
  onConfirm,
  children,
  wide,
}: {
  open: boolean
  title: string
  onCancel: () => void
  onConfirm: () => void
  children: ReactNode
  wide?: boolean
}) {
  const uid = useId()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="wheel-sheet-backdrop"
      role="presentation"
      onClick={onCancel}
      onWheel={(e) => e.preventDefault()}
    >
      <div
        className={`wheel-sheet${wide ? ' wheel-sheet--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wheel-sheet-header">
          <button type="button" className="btn ghost btn-compact" onClick={onCancel}>
            İptal
          </button>
          <strong id={`${uid}-title`}>{title}</strong>
          <button type="button" className="btn primary btn-compact" onClick={onConfirm}>
            Tamam
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
  const options = useMemo(() => {
    const out: WheelOption[] = []
    for (let m = min; m <= max; m += step) {
      out.push({ value: String(m), label: String(m) })
    }
    return out
  }, [min, max, step])

  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    if (open) setDraft(String(value))
  }, [open, value])

  return (
    <WheelPickerShell
      open={open}
      title={title}
      onCancel={onClose}
      onConfirm={() => {
        onChange(Number(draft))
        onClose()
      }}
    >
      <div className="wheel-sheet-columns wheel-sheet-columns--time">
        <WheelColumnString options={options} value={draft} onChange={setDraft} />
        <div className="wheel-time-unit" aria-hidden>
          dk
        </div>
      </div>
    </WheelPickerShell>
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

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function useTimeWheelOptions(minuteStep: number) {
  const hourOptions = useMemo(() => {
    const out: WheelOption[] = []
    for (let h = 0; h <= 23; h++) {
      out.push({ value: pad2(h), label: pad2(h) })
    }
    return out
  }, [])

  const minuteOptions = useMemo(() => {
    const out: WheelOption[] = []
    for (let m = 0; m < 60; m += minuteStep) {
      out.push({ value: pad2(m), label: pad2(m) })
    }
    return out
  }, [minuteStep])

  return { hourOptions, minuteOptions }
}

function snapMinuteStr(minuteOptions: WheelOption[], minute: number): string {
  const items = minuteOptions.map((o) => ({
    value: Number(o.value),
    label: o.label,
  }))
  const snapped = items[nearestIndex(items, minute)]?.value ?? 0
  return pad2(snapped)
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
  const { hourOptions, minuteOptions } = useTimeWheelOptions(minuteStep)
  const parsed = parseHhmm(value)
  const [hour, setHour] = useState(pad2(parsed.hour))
  const [minute, setMinute] = useState(snapMinuteStr(minuteOptions, parsed.minute))

  useEffect(() => {
    if (!open) return
    const p = parseHhmm(value)
    setHour(pad2(p.hour))
    setMinute(snapMinuteStr(minuteOptions, p.minute))
  }, [open, value, minuteOptions])

  return (
    <WheelPickerShell
      open={open}
      title={title}
      onCancel={onClose}
      onConfirm={() => {
        onChange(`${hour}:${minute}`)
        onClose()
      }}
    >
      <div className="wheel-sheet-columns wheel-sheet-columns--time">
        <WheelColumnString options={hourOptions} value={hour} onChange={setHour} />
        <div className="wheel-time-sep" aria-hidden>
          :
        </div>
        <WheelColumnString
          options={minuteOptions}
          value={minute}
          onChange={setMinute}
        />
      </div>
    </WheelPickerShell>
  )
}

type TimeRangeWheelPickerProps = {
  open: boolean
  fromValue: string
  toValue: string
  minuteStep?: number
  title?: string
  onChange: (from: string, to: string) => void
  onClose: () => void
}

export function TimeRangeWheelPicker({
  open,
  fromValue,
  toValue,
  minuteStep = 5,
  title = 'Saat aralığı',
  onChange,
  onClose,
}: TimeRangeWheelPickerProps) {
  const { hourOptions, minuteOptions } = useTimeWheelOptions(minuteStep)
  const fromParsed = parseHhmm(fromValue || '08:45')
  const toParsed = parseHhmm(toValue || '12:00')

  const [fromHour, setFromHour] = useState(pad2(fromParsed.hour))
  const [fromMinute, setFromMinute] = useState(
    snapMinuteStr(minuteOptions, fromParsed.minute),
  )
  const [toHour, setToHour] = useState(pad2(toParsed.hour))
  const [toMinute, setToMinute] = useState(
    snapMinuteStr(minuteOptions, toParsed.minute),
  )

  useEffect(() => {
    if (!open) return
    const from = parseHhmm(fromValue || '08:45')
    const to = parseHhmm(toValue || '12:00')
    setFromHour(pad2(from.hour))
    setFromMinute(snapMinuteStr(minuteOptions, from.minute))
    setToHour(pad2(to.hour))
    setToMinute(snapMinuteStr(minuteOptions, to.minute))
  }, [open, fromValue, toValue, minuteOptions])

  return (
    <WheelPickerShell
      open={open}
      title={title}
      onCancel={onClose}
      onConfirm={() => {
        onChange(`${fromHour}:${fromMinute}`, `${toHour}:${toMinute}`)
        onClose()
      }}
      wide
    >
      <div className="wheel-sheet-columns wheel-sheet-columns--range">
        <div className="wheel-range-block">
          <span className="wheel-col-label">Başlangıç</span>
          <div className="wheel-sheet-columns wheel-sheet-columns--time">
            <WheelColumnString
              options={hourOptions}
              value={fromHour}
              onChange={setFromHour}
            />
            <div className="wheel-time-sep" aria-hidden>
              :
            </div>
            <WheelColumnString
              options={minuteOptions}
              value={fromMinute}
              onChange={setFromMinute}
            />
          </div>
        </div>
        <span className="wheel-range-dash" aria-hidden>
          –
        </span>
        <div className="wheel-range-block">
          <span className="wheel-col-label">Bitiş</span>
          <div className="wheel-sheet-columns wheel-sheet-columns--time">
            <WheelColumnString
              options={hourOptions}
              value={toHour}
              onChange={setToHour}
            />
            <div className="wheel-time-sep" aria-hidden>
              :
            </div>
            <WheelColumnString
              options={minuteOptions}
              value={toMinute}
              onChange={setToMinute}
            />
          </div>
        </div>
      </div>
    </WheelPickerShell>
  )
}

type FileSessionWheelPanelProps = {
  fileValue: string
  sessionValue: string
  onFileChange: (fileSelect: string) => void
  onSessionChange: (sessionNo: string) => void
}

export function FileSessionWheelPanel({
  fileValue,
  sessionValue,
  onFileChange,
  onSessionChange,
}: FileSessionWheelPanelProps) {
  const fileOptions = useMemo(() => {
    const out: WheelOption[] = [{ value: '0', label: '—' }]
    FILE_SELECT_OPTIONS.forEach((o, i) => {
      out.push({ value: String(i + 1), label: o.label })
    })
    return out
  }, [])

  const fileIndex = useMemo(() => {
    if (!fileValue) return '0'
    const idx = FILE_SELECT_OPTIONS.findIndex((o) => o.value === fileValue)
    return idx >= 0 ? String(idx + 1) : '0'
  }, [fileValue])

  const parsedFile = parseFileSelect(fileValue)
  const sessionMax = maxSessionFor(parsedFile?.fileHalf ?? null)

  const sessionOptions = useMemo(() => {
    const out: WheelOption[] = []
    for (let n = 0; n <= sessionMax; n++) {
      out.push({ value: String(n), label: String(n) })
    }
    return out
  }, [sessionMax])

  const sessionNum = sessionValue === '' ? 0 : Number(sessionValue)
  const sessionSafe = Number.isFinite(sessionNum)
    ? String(Math.min(sessionMax, Math.max(0, sessionNum)))
    : '0'

  return (
    <div className="wheel-sheet-columns wheel-sheet-columns--embedded">
      <div className="wheel-range-block">
        <span className="wheel-col-label">Dosya</span>
        <WheelColumnString
          options={fileOptions}
          value={fileIndex}
          onChange={(idx) => {
            const n = Number(idx)
            if (n <= 0) {
              onFileChange('')
              onSessionChange('')
              return
            }
            const opt = FILE_SELECT_OPTIONS[n - 1]
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
        />
      </div>
      <div className="wheel-range-block">
        <span className="wheel-col-label">Seans</span>
        <WheelColumnString
          options={sessionOptions}
          value={sessionSafe}
          onChange={(n) => onSessionChange(n)}
        />
      </div>
    </div>
  )
}
