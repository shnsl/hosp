import type { LatLng, LegEstimate } from '../../types'

const OSRM_TABLE = 'https://router.project-osrm.org/table/v1/driving'

export type DistanceMatrix = {
  distanceKm: number[][]
  durationMin: number[][]
  source: 'osrm'
}

/** Araç yolu mesafe matrisi (OSRM driving). Kuş uçuşu kullanılmaz. */
export async function fetchDistanceMatrix(
  points: LatLng[],
): Promise<DistanceMatrix> {
  if (points.length < 2) {
    return {
      distanceKm: [[0]],
      durationMin: [[0]],
      source: 'osrm',
    }
  }

  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) {
    throw new Error('Eksik konum bilgisi')
  }

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_TABLE}/${coords}?annotations=duration,distance`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('Araç rotası alınamadı (OSRM). İnterneti kontrol et.')
  }

  const data = (await res.json()) as {
    code?: string
    distances?: (number | null)[][]
    durations?: (number | null)[][]
  }

  if (data.code !== 'Ok' || !data.distances || !data.durations) {
    throw new Error('Araç rotası yanıtı geçersiz')
  }

  const distanceKm = data.distances.map((row) =>
    row.map((m) =>
      m == null ? Number.POSITIVE_INFINITY : Math.round((m / 1000) * 10) / 10,
    ),
  )
  const durationMin = data.durations.map((row) =>
    row.map((s) =>
      s == null ? Number.POSITIVE_INFINITY : Math.max(1, Math.round(s / 60)),
    ),
  )

  return { distanceKm, durationMin, source: 'osrm' }
}

export function legsAlongOrder(
  order: number[],
  matrix: DistanceMatrix,
): LegEstimate[] {
  const legs: LegEstimate[] = []
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i]
    const to = order[i + 1]
    legs.push({
      fromIndex: from,
      toIndex: to,
      distanceKm: matrix.distanceKm[from][to],
      durationMin: matrix.durationMin[from][to],
      source: 'osrm',
    })
  }
  return legs
}
