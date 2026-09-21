import type { LatLng, RouteSuggestion } from '../../types'
import { fetchDistanceMatrix, legsAlongOrder, type DistanceMatrix } from './matrix'

function pathCost(order: number[], durationMin: number[][]): number {
  let cost = 0
  for (let i = 0; i < order.length - 1; i++) {
    cost += durationMin[order[i]][order[i + 1]]
  }
  return cost
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

function twoOpt(order: number[], durationMin: number[][]): number[] {
  let best = [...order]
  let improved = true
  while (improved) {
    improved = false
    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const next = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1))
        if (pathCost(next, durationMin) + 0.01 < pathCost(best, durationMin)) {
          best = next
          improved = true
        }
      }
    }
  }
  return best
}

function bruteForceBest(durationMin: number[][]): number[] {
  const n = durationMin.length
  const indices = Array.from({ length: n }, (_, i) => i)
  let best = [...indices]
  let bestCost = pathCost(best, durationMin)

  function permute(arr: number[], start: number) {
    if (start === arr.length - 1) {
      const c = pathCost(arr, durationMin)
      if (c < bestCost) {
        bestCost = c
        best = [...arr]
      }
      return
    }
    for (let i = start; i < arr.length; i++) {
      ;[arr[start], arr[i]] = [arr[i], arr[start]]
      permute(arr, start + 1)
      ;[arr[start], arr[i]] = [arr[i], arr[start]]
    }
  }

  permute(indices, 0)
  return best
}

function optimizeOrder(matrix: DistanceMatrix): number[] {
  const n = matrix.durationMin.length
  if (n <= 1) return Array.from({ length: n }, (_, i) => i)
  if (n <= 7) return bruteForceBest(matrix.durationMin)

  let best = nearestNeighbor(matrix.durationMin, 0)
  let bestCost = pathCost(best, matrix.durationMin)
  for (let s = 1; s < n; s++) {
    const candidate = twoOpt(nearestNeighbor(matrix.durationMin, s), matrix.durationMin)
    const c = pathCost(candidate, matrix.durationMin)
    if (c < bestCost) {
      best = candidate
      bestCost = c
    }
  }
  return twoOpt(best, matrix.durationMin)
}

export async function suggestRoute(points: LatLng[]): Promise<RouteSuggestion> {
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

  const matrix = await fetchDistanceMatrix(points)
  const order = optimizeOrder(matrix)
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
