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

/** Kayıtlı rota durağı (hasta değil; günlere eklenebilir) */
export interface Stop {
  id: string
  name: string
  lat: number
  lng: number
  /** Varsayılan bekleme (dk), 1–60 */
  waitMin: number
  createdAt: string
  updatedAt: string
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
  /** Kaçıncı seans (manuel / otomatik) */
  sessionNo?: number | null
  /** Kaçıncı dosya (1–3) */
  fileNo?: number | null
  /** Bölünmüş dosya yarısı: 1 → x.1, 2 → x.2; yoksa tam 30 */
  fileHalf?: 1 | 2 | null
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
  /** Alındı/iptal işaretinin geçerli olduğu takvim günü (YYYY-MM-DD) */
  statusDate?: string | null
  /** Hasta ziyareti veya rota durağı */
  kind?: 'patient' | 'stop'
  stopName?: string | null
  stopLat?: number | null
  stopLng?: number | null
  /** Durak paketi kimliği (ör. tam) — paketle eklenen duraklar */
  stopPackage?: string | null
  createdAt: string
  updatedAt: string
}

export function isStopVisit(v: Pick<Visit, 'kind'>): boolean {
  return v.kind === 'stop'
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
