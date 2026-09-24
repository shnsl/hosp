import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { z } from 'zod'
import type { Visit, VisitStatus, Weekday } from '../../types'
import { db } from '../../lib/firebase'
import { isWeekday, weekdayFromIsoDate } from '../../lib/dates'

export const visitFormSchema = z.object({
  patientId: z.string().min(1, 'Hasta seç'),
  weekday: z.number().int().min(1).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Saat gerekli'),
  durationMin: z.number().int().min(15).max(240).default(45),
  status: z.enum(['planned', 'done', 'cancelled']).default('planned'),
})

export type VisitFormValues = z.infer<typeof visitFormSchema>

function resolveWeekday(data: Record<string, unknown>): Weekday {
  if (typeof data.weekday === 'number' && isWeekday(data.weekday)) {
    return data.weekday
  }
  const fromDate = typeof data.date === 'string' ? weekdayFromIsoDate(data.date) : null
  return fromDate ?? 1
}

function mapVisit(id: string, data: Record<string, unknown>): Visit {
  return {
    id,
    patientId: String(data.patientId ?? ''),
    weekday: resolveWeekday(data),
    startTime: String(data.startTime ?? '09:00'),
    order: typeof data.order === 'number' ? data.order : 0,
    durationMin: typeof data.durationMin === 'number' ? data.durationMin : 45,
    status: (data.status as VisitStatus) || 'planned',
    createdAt: String(data.createdAtIso ?? data.createdAt ?? ''),
    updatedAt: String(data.updatedAtIso ?? data.updatedAt ?? ''),
  }
}

function sortVisits(visits: Visit[]): Visit[] {
  return [...visits].sort(
    (a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime),
  )
}

export function subscribeVisitsForWeekday(
  practiceId: string,
  weekday: Weekday,
  onData: (visits: Visit[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'practices', practiceId, 'visits'),
    where('weekday', '==', weekday),
  )

  return onSnapshot(
    q,
    (snap) => {
      onData(sortVisits(snap.docs.map((d) => mapVisit(d.id, d.data() as Record<string, unknown>))))
    },
    (err) => onError?.(err),
  )
}

/** Haftalık görünüm: tüm şablon ziyaretleri */
export function subscribeAllVisits(
  practiceId: string,
  onData: (visits: Visit[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'practices', practiceId, 'visits'),
    (snap) => {
      onData(sortVisits(snap.docs.map((d) => mapVisit(d.id, d.data() as Record<string, unknown>))))
    },
    (err) => onError?.(err),
  )
}

/** Eski date alanını weekday’e bir kez çevir */
export async function migrateVisitsToWeekday(practiceId: string): Promise<number> {
  const snap = await getDocs(collection(db, 'practices', practiceId, 'visits'))
  let updated = 0
  let batch = writeBatch(db)
  let ops = 0

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    if (typeof data.weekday === 'number' && isWeekday(data.weekday)) continue

    const wd =
      typeof data.date === 'string' ? weekdayFromIsoDate(data.date) : null
    if (!wd) continue

    batch.update(d.ref, { weekday: wd })
    updated += 1
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  if (ops > 0) await batch.commit()
  return updated
}

export async function createVisit(
  practiceId: string,
  values: VisitFormValues,
  order: number,
): Promise<string> {
  const parsed = visitFormSchema.parse(values)
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'practices', practiceId, 'visits'), {
    patientId: parsed.patientId,
    weekday: parsed.weekday,
    startTime: parsed.startTime,
    durationMin: parsed.durationMin,
    status: parsed.status,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now,
    updatedAtIso: now,
  })
  return ref.id
}

export async function updateVisit(
  practiceId: string,
  visitId: string,
  patch: Partial<
    Pick<Visit, 'startTime' | 'durationMin' | 'status' | 'order' | 'patientId' | 'weekday'>
  >,
): Promise<void> {
  await updateDoc(doc(db, 'practices', practiceId, 'visits', visitId), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  })
}

export async function deleteVisit(
  practiceId: string,
  visitId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'practices', practiceId, 'visits', visitId))
}

export async function reorderVisits(
  practiceId: string,
  orderedVisitIds: string[],
): Promise<void> {
  const batch = writeBatch(db)
  const now = new Date().toISOString()
  orderedVisitIds.forEach((id, index) => {
    batch.update(doc(db, 'practices', practiceId, 'visits', id), {
      order: index,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    })
  })
  await batch.commit()
}

export async function applyVisitOrderAndTimes(
  practiceId: string,
  visits: Array<{
    id: string
    order: number
    startTime: string
    durationMin?: number
  }>,
): Promise<void> {
  const batch = writeBatch(db)
  const now = new Date().toISOString()
  for (const v of visits) {
    const patch: Record<string, unknown> = {
      order: v.order,
      startTime: v.startTime,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    }
    if (typeof v.durationMin === 'number') {
      patch.durationMin = v.durationMin
    }
    batch.update(doc(db, 'practices', practiceId, 'visits', v.id), patch)
  }
  await batch.commit()
}
