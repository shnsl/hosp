export type VisitStatus = 'planned' | 'done' | 'cancelled'

/** Pazartesi=1 … Cumartesi=6 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6

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
  /** Tedavi kabul başlangıcı HH:MM; yoksa kısıt yok */
  acceptFrom?: string | null
  /** Tedavi kabul bitişi HH:MM; yoksa kısıt yok */
  acceptTo?: string | null
  createdAt: string
  updatedAt: string
}

/** Otomatik sıralama için hasta saat penceresi (dakika, gün başından) */
export interface AcceptWindowMin {
  fromMin: number | null
  toMin: number | null
}

export interface Visit {
  id: string
  patientId: string
  /** 1=Pzt … 6=Cmt — her hafta tekrarlar */
  weekday: Weekday
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
  source: 'osrm'
}

export interface RouteSuggestion {
  order: number[]
  legs: LegEstimate[]
  totalDistanceKm: number
  totalDurationMin: number
  source: 'osrm'
  warning?: string
}
