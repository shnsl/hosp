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
import type { Patient } from '../../types'
import { db } from '../../lib/firebase'
import { formatLatLng, parseLatLngText } from '../routing/coords'

export const patientFormSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli'),
  /** "37.092154, 37.400484" */
  coords: z.string().trim().min(3, 'Konum gerekli'),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().default(true),
})

export type PatientFormValues = z.infer<typeof patientFormSchema>

function mapPatient(id: string, data: Record<string, unknown>): Patient {
  return {
    id,
    name: String(data.name ?? ''),
    address: String(data.address ?? ''),
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    phone: data.phone ? String(data.phone) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    active: data.active !== false,
    createdAt: String(data.createdAtIso ?? data.createdAt ?? ''),
    updatedAt: String(data.updatedAtIso ?? data.updatedAt ?? ''),
  }
}

export function subscribePatients(
  practiceId: string,
  onData: (patients: Patient[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'practices', practiceId, 'patients'),
    orderBy('name'),
  )

  return onSnapshot(
    q,
    (snap) => {
      const patients = snap.docs.map((d) =>
        mapPatient(d.id, d.data() as Record<string, unknown>),
      )
      onData(patients)
    },
    (err) => onError?.(err),
  )
}

export async function createPatient(
  practiceId: string,
  values: PatientFormValues,
): Promise<string> {
  const parsed = patientFormSchema.parse(values)
  const { lat, lng } = parseLatLngText(parsed.coords)

  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'practices', practiceId, 'patients'), {
    name: parsed.name,
    address: parsed.address || formatLatLng(lat, lng, 6),
    phone: parsed.phone || null,
    notes: parsed.notes || null,
    active: parsed.active,
    lat,
    lng,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtIso: now,
    updatedAtIso: now,
  })
  return ref.id
}

export async function updatePatient(
  practiceId: string,
  patientId: string,
  values: PatientFormValues,
): Promise<void> {
  const parsed = patientFormSchema.parse(values)
  const { lat, lng } = parseLatLngText(parsed.coords)

  await updateDoc(doc(db, 'practices', practiceId, 'patients', patientId), {
    name: parsed.name,
    address: parsed.address || formatLatLng(lat, lng, 6),
    phone: parsed.phone || null,
    notes: parsed.notes || null,
    active: parsed.active,
    lat,
    lng,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  })
}

export async function deletePatient(
  practiceId: string,
  patientId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'practices', practiceId, 'patients', patientId))
}
