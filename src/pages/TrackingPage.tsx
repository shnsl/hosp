import { useEffect, useMemo, useState } from 'react'
import {
  subscribeAttendanceRange,
  type AttendanceRecord,
} from '../features/attendance/api'
import { subscribePatients } from '../features/patients/api'
import { subscribeAllVisits } from '../features/visits/api'
import { useAuth } from '../lib/auth'
import { weekDayColumns } from '../lib/dates'
import type { Patient, Visit } from '../types'

export function TrackingPage() {
  const { practiceId } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const prevCols = useMemo(() => weekDayColumns(-1), [])
  const thisCols = useMemo(() => weekDayColumns(0), [])
  const fromIso = prevCols[0]?.iso ?? ''
  const toIso = thisCols[5]?.iso ?? ''

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, setPatients, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    return subscribeAllVisits(practiceId, setVisits, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    if (!practiceId || !fromIso || !toIso) return
    return subscribeAttendanceRange(
      practiceId,
      fromIso,
      toIso,
      setAttendance,
      (e) => setError(e.message),
    )
  }, [practiceId, fromIso, toIso])

  const plannedWeekdays = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const v of visits) {
      const set = map.get(v.patientId) ?? new Set<number>()
      set.add(v.weekday)
      map.set(v.patientId, set)
    }
    return map
  }, [visits])

  const markByKey = useMemo(() => {
    const m = new Map<string, 'done' | 'cancelled'>()
    for (const a of attendance) {
      m.set(`${a.patientId}_${a.date}`, a.status)
    }
    return m
  }, [attendance])

  const rows = useMemo(() => {
    return patients
      .filter((p) => p.active && (plannedWeekdays.get(p.id)?.size ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [patients, plannedWeekdays])

  function cellMark(patientId: string, iso: string, weekday: number) {
    const planned = plannedWeekdays.get(patientId)?.has(weekday)
    if (!planned) return 'none' as const
    return markByKey.get(`${patientId}_${iso}`) ?? 'empty'
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Takip</p>
          <h1>Özet</h1>
          <p className="muted">Geçen Hafta ve Bu Hafta · Yeşil Alındı · Kırmızı İptal</p>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="muted">Planlı hasta yok.</p>
      ) : (
        <div className="track-table-wrap">
          <table className="track-table">
            <thead>
              <tr>
                <th className="track-name-col" rowSpan={2}>
                  Hasta
                </th>
                <th colSpan={6}>Geçen Hafta</th>
                <th colSpan={6}>Bu Hafta</th>
              </tr>
              <tr>
                {prevCols.map((c) => (
                  <th key={`p-${c.iso}`} title={c.short}>
                    <span className="track-day">{c.short}</span>
                    <span className="track-date">{c.label}</span>
                  </th>
                ))}
                {thisCols.map((c) => (
                  <th key={`t-${c.iso}`} title={c.short}>
                    <span className="track-day">{c.short}</span>
                    <span className="track-date">{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="track-name-col">
                    {p.name}
                  </th>
                  {[...prevCols, ...thisCols].map((c) => {
                    const mark = cellMark(p.id, c.iso, c.weekday)
                    return (
                      <td key={`${p.id}-${c.iso}`}>
                        {mark === 'done' ? (
                          <span className="track-dot is-done" title="Alındı" />
                        ) : mark === 'cancelled' ? (
                          <span className="track-dot is-cancel" title="İptal" />
                        ) : mark === 'empty' ? (
                          <span className="track-dot is-empty" title="İşaret yok" />
                        ) : (
                          <span className="track-dot is-none" title="Plan yok" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
