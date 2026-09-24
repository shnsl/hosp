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
    acceptFrom: typeof data.acceptFrom === 'string' && data.acceptFrom ? data.acceptFrom : null,
    acceptTo: typeof data.acceptTo === 'string' && data.acceptTo ? data.acceptTo : null,
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

export async function updatePatientAcceptWindow(
  practiceId: string,
  patientId: string,
  acceptFrom: string | null,
  acceptTo: string | null,
): Promise<void> {
  const from = normalizeTime24(acceptFrom)
  const to = normalizeTime24(acceptTo)
  if (acceptFrom?.trim() && !from) {
    throw new Error('Başlangıç saati 24s formatında olmalı (ör. 08:45)')
  }
  if (acceptTo?.trim() && !to) {
    throw new Error('Bitiş saati 24s formatında olmalı (ör. 12:00)')
  }
  if (from && to && from >= to) {
    throw new Error('Bitiş, başlangıçtan sonra olmalı')
  }

  await updateDoc(doc(db, 'practices', practiceId, 'patients', patientId), {
    acceptFrom: from,
    acceptTo: to,
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  })
}

/** "8:45" / "08:45" / "0845" → "08:45"; geçersizse null */
function normalizeTime24(input: string | null | undefined): string | null {
  if (!input?.trim()) return null
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 3 && digits.length !== 4) {
    const m = input.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  const padded = digits.padStart(4, '0')
  const h = Number(padded.slice(0, 2))
  const min = Number(padded.slice(2))
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export async function deletePatient(
  practiceId: string,
  patientId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'practices', practiceId, 'patients', patientId))
}
