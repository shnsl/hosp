import type { LatLng, LegEstimate } from '../../types'

const OSRM_TABLE = 'https://router.project-osrm.org/table/v1/driving'
const AVG_CITY_KMH = 30

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function haversineDurationMin(km: number): number {
  return Math.max(1, Math.round((km / AVG_CITY_KMH) * 60))
}

export type DistanceMatrix = {
  distanceKm: number[][]
  durationMin: number[][]
  source: 'osrm' | 'haversine'
  warning?: string
}

function buildHaversineMatrix(points: LatLng[]): DistanceMatrix {
  const n = points.length
  const distanceKm = Array.from({ length: n }, () => Array(n).fill(0))
  const durationMin = Array.from({ length: n }, () => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const km = haversineKm(points[i], points[j])
      distanceKm[i][j] = Math.round(km * 10) / 10
      durationMin[i][j] = haversineDurationMin(km)
    }
  }

  return {
    distanceKm,
    durationMin,
    source: 'haversine',
    warning: 'Yaklaşık mesafe (kuş uçuşu). Araç rotası alınamadı.',
  }
}

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

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('OSRM hata')
    const data = (await res.json()) as {
      code?: string
      distances?: (number | null)[][]
      durations?: (number | null)[][]
    }
    if (data.code !== 'Ok' || !data.distances || !data.durations) {
      throw new Error('OSRM yanıtı geçersiz')
    }

    const distanceKm = data.distances.map((row) =>
      row.map((m) => (m == null ? Number.POSITIVE_INFINITY : Math.round((m / 1000) * 10) / 10)),
    )
    const durationMin = data.durations.map((row) =>
      row.map((s) =>
        s == null ? Number.POSITIVE_INFINITY : Math.max(1, Math.round(s / 60)),
      ),
    )

    return { distanceKm, durationMin, source: 'osrm' }
  } catch {
    return buildHaversineMatrix(points)
  }
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
      source: matrix.source,
    })
  }
  return legs
}
