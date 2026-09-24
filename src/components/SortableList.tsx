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

/**
 * Satırın kendisinden sürükle-bırak (buton/link hariç).
 * Sağda scroll boşluğu CSS ile bırakılır.
 */
export function SortableList<T extends Item>({
  items,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const [local, setLocal] = useState(items)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const localRef = useRef(items)
  localRef.current = local

  useEffect(() => {
    if (draggingRef.current) return
    setLocal(items)
  }, [items])

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('button, a, input, textarea, select, [data-no-drag]'))
  }

  function onRowPointerDown(e: ReactPointerEvent<HTMLLIElement>, index: number) {
    if (e.button !== 0) return
    if (isInteractiveTarget(e.target)) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragIndexRef.current = index
    draggingRef.current = true
    setDraggingId(localRef.current[index]?.id ?? null)
  }

  function onRowPointerMove(e: ReactPointerEvent<HTMLLIElement>) {
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
    const target = e.currentTarget
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId)
    }
    if (draggingRef.current) {
      onReorder(localRef.current.map((i) => i.id))
    }
    dragIndexRef.current = null
    draggingRef.current = false
    setDraggingId(null)
  }

  return (
    <ul className="sortable-list">
      {local.map((item, index) => (
        <li
          key={item.id}
          data-sort-id={item.id}
          className={`sortable-row ${draggingId === item.id ? 'is-dragging' : ''}`}
          onPointerDown={(e) => onRowPointerDown(e, index)}
          onPointerMove={onRowPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <div className="sortable-body">{renderItem(item, index)}</div>
        </li>
      ))}
    </ul>
  )
}
