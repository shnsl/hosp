import type { AcceptWindowMin, LatLng, RouteSuggestion } from '../../types'
import { fetchDistanceMatrix, legsAlongOrder, type DistanceMatrix } from './matrix'

function pathCost(order: number[], durationMin: number[][]): number {
  let cost = 0
  for (let i = 0; i < order.length - 1; i++) {
    cost += durationMin[order[i]][order[i + 1]]
  }
  return cost
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Sırayı simüle eder: erken varışta acceptFrom’a kadar bekler.
 * Kabul penceresi dışı başlangıç → sonsuz ceza.
 * Dönen skor: toplam araç süresi + bekleme (dakika).
 */
function scheduleScore(
  order: number[],
  durationMin: number[][],
  windows: AcceptWindowMin[] | undefined,
  dayStartMin: number,
  visitDurationMin: number,
): { score: number; feasible: boolean } {
  let t = dayStartMin
  let waitTotal = 0
  let feasible = true

  for (let i = 0; i < order.length; i++) {
    const idx = order[i]
    const w = windows?.[idx]
    if (w?.fromMin != null && t < w.fromMin) {
      waitTotal += w.fromMin - t
      t = w.fromMin
    }
    if (w?.toMin != null && t > w.toMin) {
      feasible = false
    }
    if (i < order.length - 1) {
      t += visitDurationMin + durationMin[order[i]][order[i + 1]]
    }
  }

  const drive = pathCost(order, durationMin)
  if (!feasible) {
    return { score: drive + waitTotal + 100_000, feasible: false }
  }
  return { score: drive + waitTotal, feasible: true }
}

function nearestNeighbor(durationMin: number[][], start = 0): number[] {
  const n = durationMin.length
  const remaining = new Set(Array.from({ length: n }, (_, i) => i))
  const order: number[] = [start]
  remaining.delete(start)

  while (remaining.size > 0) {
    const last = order[order.length - 1]
    let best = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (const j of remaining) {
      const c = durationMin[last][j]
      if (c < bestCost) {
        bestCost = c
        best = j
      }
    }
    order.push(best)
    remaining.delete(best)
  }
  return order
}

function twoOpt(
  order: number[],
  durationMin: number[][],
  windows: AcceptWindowMin[] | undefined,
  dayStartMin: number,
  visitDurationMin: number,
): number[] {
  let best = [...order]
  let bestScore = scheduleScore(best, durationMin, windows, dayStartMin, visitDurationMin).score
  let improved = true
  while (improved) {
    improved = false
    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const next = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1))
        const s = scheduleScore(next, durationMin, windows, dayStartMin, visitDurationMin).score
        if (s + 0.01 < bestScore) {
          best = next
          bestScore = s
          improved = true
        }
      }
    }
  }
  return best
}

function bruteForceBestFromStart(
  durationMin: number[][],
  start: number,
  windows: AcceptWindowMin[] | undefined,
  dayStartMin: number,
  visitDurationMin: number,
): { order: number[]; feasible: boolean } {
  const n = durationMin.length
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== start)
  let best = [start, ...rest]
  let bestScore = scheduleScore(best, durationMin, windows, dayStartMin, visitDurationMin)
  let foundFeasible = bestScore.feasible

  function permute(arr: number[], at: number) {
    if (at === arr.length - 1) {
      const order = [start, ...arr]
      const scored = scheduleScore(order, durationMin, windows, dayStartMin, visitDurationMin)
      if (scored.feasible && !foundFeasible) {
        foundFeasible = true
        best = order
        bestScore = scored
        return
      }
      if (scored.feasible === foundFeasible && scored.score + 0.01 < bestScore.score) {
        best = order
        bestScore = scored
      } else if (scored.feasible && !bestScore.feasible) {
        best = order
        bestScore = scored
        foundFeasible = true
      }
      return
    }
    for (let i = at; i < arr.length; i++) {
      ;[arr[at], arr[i]] = [arr[i], arr[at]]
      permute(arr, at + 1)
      ;[arr[at], arr[i]] = [arr[i], arr[at]]
    }
  }

  permute(rest, 0)
  return { order: best, feasible: bestScore.feasible }
}

function optimizeOrder(
  matrix: DistanceMatrix,
  startIndex: number,
  windows: AcceptWindowMin[] | undefined,
  dayStartMin: number,
  visitDurationMin: number,
): { order: number[]; feasible: boolean } {
  const n = matrix.durationMin.length
  if (n <= 1) {
    return { order: Array.from({ length: n }, (_, i) => i), feasible: true }
  }
  const start = Math.max(0, Math.min(startIndex, n - 1))
  if (n <= 8) {
    return bruteForceBestFromStart(
      matrix.durationMin,
      start,
      windows,
      dayStartMin,
      visitDurationMin,
    )
  }
  const nn = nearestNeighbor(matrix.durationMin, start)
  const order = twoOpt(nn, matrix.durationMin, windows, dayStartMin, visitDurationMin)
  const scored = scheduleScore(order, matrix.durationMin, windows, dayStartMin, visitDurationMin)
  return { order, feasible: scored.feasible }
}

export type SuggestRouteOptions = {
  startIndex?: number
  /** points ile aynı sırada kabul pencereleri */
  windows?: AcceptWindowMin[]
  dayStartMin?: number
  visitDurationMin?: number
}

export async function suggestRoute(
  points: LatLng[],
  options?: SuggestRouteOptions,
): Promise<RouteSuggestion> {
  if (points.length === 0) {
    return {
      order: [],
      legs: [],
      totalDistanceKm: 0,
      totalDurationMin: 0,
      source: 'osrm',
    }
  }
  if (points.length === 1) {
    return {
      order: [0],
      legs: [],
      totalDistanceKm: 0,
      totalDurationMin: 0,
      source: 'osrm',
    }
  }

  const dayStartMin = options?.dayStartMin ?? timeToMinutes('08:45')
  const visitDurationMin = options?.visitDurationMin ?? 30
  const matrix = await fetchDistanceMatrix(points)
  const { order, feasible } = optimizeOrder(
    matrix,
    options?.startIndex ?? 0,
    options?.windows,
    dayStartMin,
    visitDurationMin,
  )
  const legs = legsAlongOrder(order, matrix)
  const totalDistanceKm =
    Math.round(legs.reduce((s, l) => s + l.distanceKm, 0) * 10) / 10
  const totalDurationMin = legs.reduce((s, l) => s + l.durationMin, 0)

  return {
    order,
    legs,
    totalDistanceKm,
    totalDurationMin,
    source: matrix.source,
    warning: feasible
      ? undefined
      : 'Bazı hastaların kabul saatlerine tam uyulamadı; en yakın sıra uygulandı',
  }
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const nh = Math.floor(wrapped / 60)
  const nm = wrapped % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export function patientToAcceptWindow(patient: {
  acceptFrom?: string | null
  acceptTo?: string | null
}): AcceptWindowMin {
  return {
    fromMin: patient.acceptFrom ? timeToMinutes(patient.acceptFrom) : null,
    toMin: patient.acceptTo ? timeToMinutes(patient.acceptTo) : null,
  }
}
