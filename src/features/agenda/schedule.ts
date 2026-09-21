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
 * İlk hasta DAY_START'ta başlar.
 * Her hastada VISIT_DURATION_MIN kalınır.
 * Sonraki başlangıç = bitiş + OSRM araç süresi.
 */
export async function buildDaySchedule(
  orderedVisits: Visit[],
  patientMap: Map<string, Patient>,
): Promise<DaySchedule> {
  if (orderedVisits.length === 0) {
    return { visits: [], legs: [] }
  }

  const points: LatLng[] = []
  for (const v of orderedVisits) {
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
  const visits: DaySchedule['visits'] = []
  const legs: ScheduleLeg[] = []

  for (let i = 0; i < orderedVisits.length; i++) {
    const v = orderedVisits[i]
    visits.push({
      id: v.id,
      order: i,
      startTime: time,
      durationMin: VISIT_DURATION_MIN,
    })

    if (i < orderedVisits.length - 1) {
      const drive = durationMinMatrix[i][i + 1]
      const km = distanceKmMatrix[i][i + 1]
      if (!Number.isFinite(drive) || !Number.isFinite(km)) {
        throw new Error('Araç rotası hesaplanamadı (OSRM)')
      }
      legs.push({
        afterVisitId: v.id,
        distanceKm: km,
        durationMin: drive,
      })
      time = addMinutesToTime(time, VISIT_DURATION_MIN + drive)
    }
  }

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
