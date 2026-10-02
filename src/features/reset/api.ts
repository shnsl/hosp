import {
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'

async function commitDeletes(
  practiceId: string,
  collectionName: 'visits' | 'attendance',
): Promise<number> {
  const snap = await getDocs(
    collection(db, 'practices', practiceId, collectionName),
  )
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

/** Tüm günlük plan listelerindeki ziyaretleri siler */
export async function clearAllVisitLists(practiceId: string): Promise<number> {
  return commitDeletes(practiceId, 'visits')
}

/** Özet / yoklama tablosunu temizler */
export async function clearAttendanceTable(practiceId: string): Promise<number> {
  return commitDeletes(practiceId, 'attendance')
}

/** Tüm hastalarda seans numarasını 0 yapar (dosya bilgisi kalır) */
export async function resetAllSessionCounts(practiceId: string): Promise<number> {
  const snap = await getDocs(collection(db, 'practices', practiceId, 'patients'))
  if (snap.empty) return 0

  let updated = 0
  let batch = writeBatch(db)
  let ops = 0
  const now = new Date().toISOString()
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    if (typeof data.sessionNo !== 'number' && typeof data.fileNo !== 'number') {
      continue
    }
    batch.update(d.ref, {
      sessionNo: 0,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    })
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

/** Tüm hastalarda dosya=1, seans=0, yarım dosya yok */
export async function resetAllSessionAndFileCounts(
  practiceId: string,
): Promise<number> {
  const snap = await getDocs(collection(db, 'practices', practiceId, 'patients'))
  if (snap.empty) return 0

  let updated = 0
  let batch = writeBatch(db)
  let ops = 0
  const now = new Date().toISOString()
  for (const d of snap.docs) {
    batch.update(d.ref, {
      fileNo: 1,
      sessionNo: 0,
      fileHalf: null,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    })
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
