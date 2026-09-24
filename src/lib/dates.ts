import type { Weekday } from '../types'

export type { Weekday }

export const WEEKDAYS: ReadonlyArray<{
  value: Weekday
  short: string
  long: string
}> = [
  { value: 1, short: 'Pzt', long: 'Pazartesi' },
  { value: 2, short: 'Sal', long: 'Salı' },
  { value: 3, short: 'Çar', long: 'Çarşamba' },
  { value: 4, short: 'Per', long: 'Perşembe' },
  { value: 5, short: 'Cum', long: 'Cuma' },
  { value: 6, short: 'Cmt', long: 'Cumartesi' },
]

export function isWeekday(n: number): n is Weekday {
  return Number.isInteger(n) && n >= 1 && n <= 6
}

/** Bugünün hafta günü; Pazar ise Pazartesi’ye düşer */
export function todayWeekday(d = new Date()): Weekday {
  const day = d.getDay()
  if (day === 0) return 1
  return day as Weekday
}

export function weekdayLabel(weekday: Weekday, form: 'short' | 'long' = 'long'): string {
  const row = WEEKDAYS.find((w) => w.value === weekday)
  if (!row) return String(weekday)
  return form === 'short' ? row.short : row.long
}

/** Eski YYYY-MM-DD kayıtlarından weekday türet (Pazar → null) */
export function weekdayFromIsoDate(isoDate: string): Weekday | null {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const day = new Date(y, m - 1, d).getDay()
  if (day === 0) return null
  return day as Weekday
}

export function todayIsoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateTr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return todayIsoDate(date)
}
