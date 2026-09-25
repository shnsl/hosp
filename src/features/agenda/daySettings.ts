import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import type { Weekday } from '../../types'
import { db } from '../../lib/firebase'
import { WEEKDAYS } from '../../lib/dates'

export const DEFAULT_DAY_START = '08:45'
export const DEFAULT_VISIT_DURATION_MIN = 30

export type DayTiming = {
  startTime: string
  durationMin: number
}

/** weekday 1–6 → timing */
export type DayScheduleSettings = Record<Weekday, DayTiming>

export const DEFAULT_DAY_TIMING: DayTiming = {
  startTime: DEFAULT_DAY_START,
  durationMin: DEFAULT_VISIT_DURATION_MIN,
}

export function defaultDayScheduleSettings(): DayScheduleSettings {
  const out = {} as DayScheduleSettings
  for (const d of WEEKDAYS) {
    out[d.value] = { ...DEFAULT_DAY_TIMING }
  }
  return out
}

function normalizeTime(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 3 || digits.length === 4) {
    const padded = digits.padStart(4, '0')
    const h = Number(padded.slice(0, 2))
    const min = Number(padded.slice(2))
    if (h > 23 || min > 59) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function normalizeDuration(input: unknown): number | null {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 15 || rounded > 180) return null
  return rounded
}

export function parseDayScheduleSettings(
  data: Record<string, unknown> | null | undefined,
): DayScheduleSettings {
  const base = defaultDayScheduleSettings()
  if (!data) return base

  const days = data.days
  if (!days || typeof days !== 'object') return base

  for (const d of WEEKDAYS) {
    const row = (days as Record<string, unknown>)[String(d.value)]
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const startTime = normalizeTime(r.startTime) ?? base[d.value].startTime
    const durationMin = normalizeDuration(r.durationMin) ?? base[d.value].durationMin
    base[d.value] = { startTime, durationMin }
  }
  return base
}

export function timingForWeekday(
  settings: DayScheduleSettings,
  weekday: Weekday,
): DayTiming {
  return settings[weekday] ?? DEFAULT_DAY_TIMING
}

export function subscribeDayScheduleSettings(
  practiceId: string,
  onData: (settings: DayScheduleSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'practices', practiceId, 'config', 'daySchedule'),
    (snap) => {
      onData(parseDayScheduleSettings(snap.data() as Record<string, unknown> | undefined))
    },
    (err) => onError?.(err),
  )
}

export async function getDayScheduleSettings(
  practiceId: string,
): Promise<DayScheduleSettings> {
  const snap = await getDoc(doc(db, 'practices', practiceId, 'config', 'daySchedule'))
  return parseDayScheduleSettings(snap.data() as Record<string, unknown> | undefined)
}

export async function saveDayScheduleSettings(
  practiceId: string,
  settings: DayScheduleSettings,
): Promise<void> {
  const days: Record<string, DayTiming> = {}
  for (const d of WEEKDAYS) {
    const t = settings[d.value]
    const startTime = normalizeTime(t.startTime) ?? DEFAULT_DAY_TIMING.startTime
    const durationMin = normalizeDuration(t.durationMin) ?? DEFAULT_DAY_TIMING.durationMin
    days[String(d.value)] = { startTime, durationMin }
  }
  await setDoc(
    doc(db, 'practices', practiceId, 'config', 'daySchedule'),
    { days, updatedAtIso: new Date().toISOString() },
    { merge: true },
  )
}
