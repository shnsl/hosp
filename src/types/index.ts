export type VisitStatus = 'planned' | 'done' | 'cancelled'

export interface UserProfile {
  email: string
  displayName?: string
  practiceId: string
  createdAt: string
}

export interface Practice {
  id: string
  name: string
  ownerUid: string
  createdAt: string
}

export interface Patient {
  id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  phone?: string
  notes?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Visit {
  id: string
  patientId: string
  date: string
  startTime: string
  order: number
  durationMin: number
  status: VisitStatus
  createdAt: string
  updatedAt: string
}

export interface LatLng {
  lat: number
  lng: number
}

export interface LegEstimate {
  fromIndex: number
  toIndex: number
  distanceKm: number
  durationMin: number
  source: 'osrm' | 'haversine'
}

export interface RouteSuggestion {
  order: number[]
  legs: LegEstimate[]
  totalDistanceKm: number
  totalDurationMin: number
  source: 'osrm' | 'haversine'
  warning?: string
}
