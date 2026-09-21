import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { z } from 'zod'
import type { Visit, VisitStatus } from '../../types'
import { db } from '../../lib/firebase'

export const visitFormSchema = z.object({
  patientId: z.string().min(1, 'Hasta seç'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gerekli'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Saat gerekli'),
  durationMin: z.number().int().min(15).max(240).default(45),
  status: z.enum(['planned', 'done', 'cancelled']).default('planned'),
})

export type VisitFormValues = z.infer<typeof visitFormSchema>

function mapVisit(id: string, data: Record<string, unknown>): Visit {
  return {
    id,
    patientId: String(data.patientId ?? ''),
    date: String(data.date ?? ''),
    startTime: String(data.startTime ?? '09:00'),
    order: typeof data.order === 'number' ? data.order : 0,
    durationMin: typeof data.durationMin === 'number' ? data.durationMin : 45,
    status: (data.status as VisitStatus) || 'planned',
    createdAt: String(data.createdAtIso ?? data.createdAt ?? ''),
    updatedAt: String(data.updatedAtIso ?? data.updatedAt ?? ''),
  }
}

export function subscribeVisitsForDate(
  practiceId: string,
  date: string,
  onData: (visits: Visit[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'practices', practiceId, 'visits'),
    where('date', '==', date),
  )

  return onSnapshot(
    q,
    (snap) => {
      const visits = snap.docs
        .map((d) => mapVisit(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime))
      onData(visits)
    },
    (err) => onError?.(err),
  )
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
    date: parsed.date,
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
  patch: Partial<Pick<Visit, 'startTime' | 'durationMin' | 'status' | 'order' | 'patientId' | 'date'>>,
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
