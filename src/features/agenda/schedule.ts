import type { LatLng, Patient, Visit, Weekday } from '../../types'
import { db } from '../../lib/firebase'
import { collection, getDocs } from 'firebase/firestore'
import { WEEKDAYS } from '../../lib/dates'
import { fetchDistanceMatrix } from '../routing/matrix'
import { addMinutesToTime } from '../routing/optimize'
import { applyVisitOrderAndTimes } from '../visits/api'
import {
  DEFAULT_DAY_START,
  DEFAULT_VISIT_DURATION_MIN,
  timingForWeekday,
  type DayScheduleSettings,
} from './daySettings'

export const DAY_START = DEFAULT_DAY_START
export const VISIT_DURATION_MIN = DEFAULT_VISIT_DURATION_MIN

export type ScheduleLeg = {
  afterVisitId: string
  distanceKm: number
  durationMin: number
}

export type DaySchedule = {
  visits: Array<{ id: string; order: number; startTime: string; durationMin: number }>
  legs: ScheduleLeg[]
}

export type BuildDayScheduleOptions = {
  skipVisitIds?: ReadonlySet<string>
  dayStart?: string
  visitDurationMin?: number
}

export function endTimeOf(startTime: string, durationMin = VISIT_DURATION_MIN): string {
  return addMinutesToTime(startTime, durationMin)
}

/**
 * İlk aktif hasta dayStart'ta başlar.
 * skipVisitIds içindeki ziyaretler rota/saatten çıkar (sırada kalır).
 */
export async function buildDaySchedule(
  orderedVisits: Visit[],
  patientMap: Map<string, Patient>,
  options?: BuildDayScheduleOptions,
): Promise<DaySchedule> {
  const dayStart = options?.dayStart ?? DAY_START
  const visitDurationMin = options?.visitDurationMin ?? VISIT_DURATION_MIN

  if (orderedVisits.length === 0) {
    return { visits: [], legs: [] }
  }

  const skip = options?.skipVisitIds ?? new Set<string>()
  const active = orderedVisits.filter((v) => !skip.has(v.id))

  if (active.length === 0) {
    return {
      visits: orderedVisits.map((v, i) => ({
        id: v.id,
        order: i,
        startTime: v.startTime || dayStart,
        durationMin: v.durationMin || visitDurationMin,
      })),
      legs: [],
    }
  }

  const points: LatLng[] = []
  for (const v of active) {
    const p = patientMap.get(v.patientId)
    if (!p || p.lat == null || p.lng == null) {
      throw new Error(
        'Tüm hastalarda enlem/boylam olmalı. Eksik konumu hasta kartından gir.',
      )
    }
    points.push({ lat: p.lat, lng: p.lng })
  }

  let durationMinMatrix: number[][] = [[0]]
  let distanceKmMatrix: number[][] = [[0]]

  if (points.length >= 2) {
    const matrix = await fetchDistanceMatrix(points)
    durationMinMatrix = matrix.durationMin
    distanceKmMatrix = matrix.distanceKm
  }

  let time = dayStart
  const activeTimes = new Map<string, { startTime: string; durationMin: number }>()
  const legs: ScheduleLeg[] = []

  for (let i = 0; i < active.length; i++) {
    const v = active[i]
    activeTimes.set(v.id, { startTime: time, durationMin: visitDurationMin })

    if (i < active.length - 1) {
      const driveRaw = durationMinMatrix[i][i + 1]
      const km = distanceKmMatrix[i][i + 1]
      if (!Number.isFinite(driveRaw) || !Number.isFinite(km)) {
        throw new Error('Araç rotası hesaplanamadı (OSRM)')
      }
      const drive = Math.max(1, Math.round(driveRaw))
      legs.push({
        afterVisitId: v.id,
        distanceKm: Math.round(km * 10) / 10,
        durationMin: drive,
      })
      time = addMinutesToTime(time, visitDurationMin + drive)
    }
  }

  const visits: DaySchedule['visits'] = orderedVisits.map((v, i) => {
    const timed = activeTimes.get(v.id)
    return {
      id: v.id,
      order: i,
      startTime: timed?.startTime ?? v.startTime ?? dayStart,
      durationMin: timed?.durationMin ?? v.durationMin ?? visitDurationMin,
    }
  })

  return { visits, legs }
}

export async function saveDaySchedule(
  practiceId: string,
  schedule: DaySchedule,
): Promise<void> {
  await applyVisitOrderAndTimes(
    practiceId,
    schedule.visits.map((v) => ({
      id: v.id,
      order: v.order,
      startTime: v.startTime,
      durationMin: v.durationMin,
    })),
  )
}

/** Ayarlar kaydedilince tüm günlerin saatlerini yeniden hesapla */
export async function rebuildAllSchedulesWithSettings(
  practiceId: string,
  settings: DayScheduleSettings,
): Promise<void> {
  const [patientsSnap, visitsSnap] = await Promise.all([
    getDocs(collection(db, 'practices', practiceId, 'patients')),
    getDocs(collection(db, 'practices', practiceId, 'visits')),
  ])

  const patientMap = new Map<string, Patient>()
  for (const d of patientsSnap.docs) {
    const data = d.data() as Record<string, unknown>
    patientMap.set(d.id, {
      id: d.id,
      name: String(data.name ?? ''),
      address: String(data.address ?? ''),
      lat: typeof data.lat === 'number' ? data.lat : null,
      lng: typeof data.lng === 'number' ? data.lng : null,
      phone: typeof data.phone === 'string' ? data.phone : undefined,
      notes: typeof data.notes === 'string' ? data.notes : undefined,
      active: data.active !== false,
      acceptFrom: typeof data.acceptFrom === 'string' ? data.acceptFrom : null,
      acceptTo: typeof data.acceptTo === 'string' ? data.acceptTo : null,
      createdAt: '',
      updatedAt: '',
    })
  }

  const byWeekday = new Map<Weekday, Visit[]>()
  for (const d of WEEKDAYS) byWeekday.set(d.value, [])

  for (const d of visitsSnap.docs) {
    const data = d.data() as Record<string, unknown>
    const weekday = data.weekday
    if (typeof weekday !== 'number' || weekday < 1 || weekday > 6) continue
    const wd = weekday as Weekday
    const visit: Visit = {
      id: d.id,
      patientId: String(data.patientId ?? ''),
      weekday: wd,
      startTime: String(data.startTime ?? DAY_START),
      order: typeof data.order === 'number' ? data.order : 0,
      durationMin:
        typeof data.durationMin === 'number' ? data.durationMin : VISIT_DURATION_MIN,
      status: (data.status as Visit['status']) || 'planned',
      statusDate: typeof data.statusDate === 'string' ? data.statusDate : null,
      createdAt: '',
      updatedAt: '',
    }
    byWeekday.get(wd)!.push(visit)
  }

  for (const d of WEEKDAYS) {
    const list = byWeekday.get(d.value) ?? []
    if (list.length === 0) continue
    list.sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime))
    const timing = timingForWeekday(settings, d.value)
    try {
      const schedule = await buildDaySchedule(list, patientMap, {
        dayStart: timing.startTime,
        visitDurationMin: timing.durationMin,
      })
      await saveDaySchedule(practiceId, schedule)
    } catch {
      /* konum eksik vb. — o günü atla */
    }
  }
}
