import type { LatLng, Patient, Visit } from '../../types'
import { fetchDistanceMatrix } from '../routing/matrix'
import { addMinutesToTime } from '../routing/optimize'
import { applyVisitOrderAndTimes } from '../visits/api'

export const DAY_START = '08:45'
export const VISIT_DURATION_MIN = 30

export type ScheduleLeg = {
  afterVisitId: string
  distanceKm: number
  durationMin: number
}

export type DaySchedule = {
  visits: Array<{ id: string; order: number; startTime: string; durationMin: number }>
  legs: ScheduleLeg[]
}

export function endTimeOf(startTime: string, durationMin = VISIT_DURATION_MIN): string {
  return addMinutesToTime(startTime, durationMin)
}

/**
 * İlk aktif hasta DAY_START'ta başlar.
 * skipVisitIds içindeki ziyaretler rota/saatten çıkar (sırada kalır).
 */
export async function buildDaySchedule(
  orderedVisits: Visit[],
  patientMap: Map<string, Patient>,
  options?: { skipVisitIds?: ReadonlySet<string> },
): Promise<DaySchedule> {
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
        startTime: v.startTime || DAY_START,
        durationMin: v.durationMin || VISIT_DURATION_MIN,
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

  let time = DAY_START
  const activeTimes = new Map<string, { startTime: string; durationMin: number }>()
  const legs: ScheduleLeg[] = []

  for (let i = 0; i < active.length; i++) {
    const v = active[i]
    activeTimes.set(v.id, { startTime: time, durationMin: VISIT_DURATION_MIN })

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
      time = addMinutesToTime(time, VISIT_DURATION_MIN + drive)
    }
  }

  const visits: DaySchedule['visits'] = orderedVisits.map((v, i) => {
    const timed = activeTimes.get(v.id)
    return {
      id: v.id,
      order: i,
      startTime: timed?.startTime ?? v.startTime ?? DAY_START,
      durationMin: timed?.durationMin ?? v.durationMin ?? VISIT_DURATION_MIN,
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
