import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { z } from 'zod'
import type { Stop } from '../../types'
import { db } from '../../lib/firebase'
import { parseLatLngText } from '../routing/coords'

export const stopFormSchema = z.object({
  name: z.string().trim().min(1, 'Durak adı gerekli'),
  coords: z.string().trim().min(3, 'Konum gerekli'),
  waitMin: z.number().int().min(1).max(60),
})

export type StopFormValues = z.infer<typeof stopFormSchema>

function mapStop(id: string, data: Record<string, unknown>): Stop {
  return {
    id,
    name: String(data.name ?? ''),
    lat: typeof data.lat === 'number' ? data.lat : 0,
    lng: typeof data.lng === 'number' ? data.lng : 0,
    waitMin:
      typeof data.waitMin === 'number' && data.waitMin >= 1 && data.waitMin <= 60
        ? data.waitMin
        : 10,
    createdAt: String(data.createdAtIso ?? data.createdAt ?? ''),
    updatedAt: String(data.updatedAtIso ?? data.updatedAt ?? ''),
  }
}

export function subscribeStops(
  practiceId: string,
  onData: (stops: Stop[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'practices', practiceId, 'stops'),
    orderBy('name'),
  )
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapStop(d.id, d.data() as Record<string, unknown>)))
    },
    (err) => onError?.(err),
  )
}

export async function createStop(
  practiceId: string,
  values: StopFormValues,
): Promise<string> {
  const parsed = stopFormSchema.parse(values)
  const { lat, lng } = parseLatLngText(parsed.coords)
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'practices', practiceId, 'stops'), {
    name: parsed.name,
    lat,
    lng,
    waitMin: parsed.waitMin,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now,
    updatedAtIso: now,
  })
  return ref.id
}

export async function updateStop(
  practiceId: string,
  stopId: string,
  values: StopFormValues,
): Promise<void> {
  const parsed = stopFormSchema.parse(values)
  const { lat, lng } = parseLatLngText(parsed.coords)
  await updateDoc(doc(db, 'practices', practiceId, 'stops', stopId), {
    name: parsed.name,
    lat,
    lng,
    waitMin: parsed.waitMin,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  })
}

export async function deleteStop(practiceId: string, stopId: string): Promise<void> {
  await deleteDoc(doc(db, 'practices', practiceId, 'stops', stopId))
}
