import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import type { VisitStatus } from '../../types'
import { db } from '../../lib/firebase'

export type AttendanceRecord = {
  id: string
  patientId: string
  date: string
  status: 'done' | 'cancelled'
}

function attendanceDocId(patientId: string, date: string): string {
  return `${patientId}_${date}`
}

function mapAttendance(id: string, data: Record<string, unknown>): AttendanceRecord | null {
  const status = data.status
  if (status !== 'done' && status !== 'cancelled') return null
  return {
    id,
    patientId: String(data.patientId ?? ''),
    date: String(data.date ?? ''),
    status,
  }
}

export function subscribeAttendanceRange(
  practiceId: string,
  fromIso: string,
  toIso: string,
  onData: (rows: AttendanceRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'practices', practiceId, 'attendance'),
    where('date', '>=', fromIso),
    where('date', '<=', toIso),
  )

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => mapAttendance(d.id, d.data() as Record<string, unknown>))
        .filter((r): r is AttendanceRecord => Boolean(r))
      onData(rows)
    },
    (err) => onError?.(err),
  )
}

export async function upsertAttendance(
  practiceId: string,
  patientId: string,
  date: string,
  status: Extract<VisitStatus, 'done' | 'cancelled'>,
): Promise<void> {
  const id = attendanceDocId(patientId, date)
  await setDoc(
    doc(db, 'practices', practiceId, 'attendance', id),
    {
      patientId,
      date,
      status,
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    },
    { merge: true },
  )
}

export async function clearAttendance(
  practiceId: string,
  patientId: string,
  date: string,
): Promise<void> {
  const id = attendanceDocId(patientId, date)
  await deleteDoc(doc(db, 'practices', practiceId, 'attendance', id))
}

/** Hastaya ait tüm yoklama kayıtlarını sil */
export async function deleteAttendanceForPatient(
  practiceId: string,
  patientId: string,
): Promise<number> {
  const q = query(
    collection(db, 'practices', practiceId, 'attendance'),
    where('patientId', '==', patientId),
  )
  const snap = await getDocs(q)
  if (snap.empty) return 0

  let deleted = 0
  let batch = writeBatch(db)
  let ops = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    deleted += 1
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  return deleted
}

/** Tüm attendance kayıtlarını sil (özet tablosu sıfırlama) */
export async function clearAllAttendance(practiceId: string): Promise<number> {
  const snap = await getDocs(collection(db, 'practices', practiceId, 'attendance'))
  if (snap.empty) return 0

  let deleted = 0
  let batch = writeBatch(db)
  let ops = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    deleted += 1
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  return deleted
}

/** beforeIso’dan eski attendance kayıtlarını sil (örn. 14 günden eski) */
export async function pruneAttendanceOlderThan(
  practiceId: string,
  beforeIso: string,
): Promise<number> {
  const q = query(
    collection(db, 'practices', practiceId, 'attendance'),
    where('date', '<', beforeIso),
  )
  const snap = await getDocs(q)
  if (snap.empty) return 0

  let deleted = 0
  let batch = writeBatch(db)
  let ops = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    deleted += 1
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  return deleted
}
