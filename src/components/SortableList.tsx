import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

type Item = { id: string }

interface SortableListProps<T extends Item> {
  items: T[]
  onReorder: (orderedIds: string[]) => void
  renderItem: (item: T, index: number) => ReactNode
}

const HOLD_MS = 1000
const MOVE_CANCEL_PX = 12

function lockPageScroll() {
  const y = window.scrollY
  document.documentElement.classList.add('sort-scroll-lock')
  document.documentElement.dataset.sortScrollY = String(y)
  document.body.style.position = 'fixed'
  document.body.style.top = `-${y}px`
  document.body.style.left = '0'
  document.body.style.right = '0'
  document.body.style.width = '100%'
}

function unlockPageScroll() {
  const y = Number(document.documentElement.dataset.sortScrollY || '0')
  document.documentElement.classList.remove('sort-scroll-lock')
  delete document.documentElement.dataset.sortScrollY
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.left = ''
  document.body.style.right = ''
  document.body.style.width = ''
  window.scrollTo(0, y)
}

/**
 * Satırın kendisinden sürükle-bırak (buton/link hariç).
 * Sürükleme kilidi: kartı 1 sn basılı tutunca açılır.
 * Sürükleme açıkken sayfa kaydırması kilitlenir.
 */
export function SortableList<T extends Item>({
  items,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const [local, setLocal] = useState(items)
  const [armingId, setArmingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const unlockedRef = useRef(false)
  const armingRef = useRef(false)
  const scrollLockedRef = useRef(false)
  const holdTimerRef = useRef<number | null>(null)
  const startPointRef = useRef<{ x: number; y: number } | null>(null)
  const armIndexRef = useRef<number | null>(null)
  const localRef = useRef(items)
  localRef.current = local

  useEffect(() => {
    if (draggingRef.current || unlockedRef.current) return
    setLocal(items)
  }, [items])

  useEffect(() => {
    return () => {
      if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current)
      if (scrollLockedRef.current) {
        unlockPageScroll()
        scrollLockedRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (!draggingId) return

    const blockTouchScroll = (e: TouchEvent) => {
      e.preventDefault()
    }

    document.addEventListener('touchmove', blockTouchScroll, { passive: false })
    return () => {
      document.removeEventListener('touchmove', blockTouchScroll)
    }
  }, [draggingId])

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('button, a, input, textarea, select, [data-no-drag]'))
  }

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  function beginScrollLock() {
    if (scrollLockedRef.current) return
    scrollLockedRef.current = true
    lockPageScroll()
  }

  function endScrollLock() {
    if (!scrollLockedRef.current) return
    scrollLockedRef.current = false
    unlockPageScroll()
  }

  function cancelArming() {
    clearHoldTimer()
    armingRef.current = false
    setArmingId(null)
    startPointRef.current = null
    armIndexRef.current = null
  }

  function onRowPointerDown(e: ReactPointerEvent<HTMLLIElement>, index: number) {
    if (e.button !== 0) return
    if (isInteractiveTarget(e.target)) return

    unlockedRef.current = false
    draggingRef.current = false
    dragIndexRef.current = null
    armIndexRef.current = index
    armingRef.current = true
    startPointRef.current = { x: e.clientX, y: e.clientY }

    const id = localRef.current[index]?.id ?? null
    setDraggingId(null)
    setArmingId(id)

    const row = e.currentTarget
    const pointerId = e.pointerId
    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      const unlockIndex = armIndexRef.current
      if (unlockIndex == null || !armingRef.current) return

      armingRef.current = false
      unlockedRef.current = true
      draggingRef.current = true
      dragIndexRef.current = unlockIndex
      setArmingId(null)
      setDraggingId(localRef.current[unlockIndex]?.id ?? id)
      beginScrollLock()

      try {
        row.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(25)
      }
    }, HOLD_MS)
  }

  function onRowPointerMove(e: ReactPointerEvent<HTMLLIElement>) {
    if (!unlockedRef.current) {
      if (!armingRef.current) return
      const start = startPointRef.current
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        cancelArming()
      }
      return
    }

    e.preventDefault()

    const from = dragIndexRef.current
    if (from == null) return

    const el = document.elementFromPoint(e.clientX, e.clientY)
    const row = el?.closest('[data-sort-id]') as HTMLElement | null
    if (!row) return
    const toId = row.dataset.sortId
    if (!toId) return
    const to = localRef.current.findIndex((i) => i.id === toId)
    if (to < 0 || to === from) return

    setLocal((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      dragIndexRef.current = to
      localRef.current = next
      return next
    })
  }

  function finishDrag(e: ReactPointerEvent<HTMLLIElement>) {
    clearHoldTimer()
    armingRef.current = false
    setArmingId(null)
    startPointRef.current = null
    armIndexRef.current = null

    const target = e.currentTarget
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId)
    }

    const didDrag = unlockedRef.current && draggingRef.current
    if (didDrag) {
      onReorder(localRef.current.map((i) => i.id))
    }

    unlockedRef.current = false
    dragIndexRef.current = null
    draggingRef.current = false
    setDraggingId(null)
    endScrollLock()
  }

  return (
    <ul className={`sortable-list${draggingId ? ' is-reordering' : ''}`}>
      {local.map((item, index) => {
        const isArming = armingId === item.id
        const isDragging = draggingId === item.id
        return (
          <li
            key={item.id}
            data-sort-id={item.id}
            className={`sortable-row${isArming ? ' is-arming' : ''}${isDragging ? ' is-dragging' : ''}`}
            onPointerDown={(e) => onRowPointerDown(e, index)}
            onPointerMove={onRowPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div className="sortable-body">{renderItem(item, index)}</div>
          </li>
        )
      })}
    </ul>
  )
}
