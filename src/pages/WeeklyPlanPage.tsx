import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { VISIT_DURATION_MIN, endTimeOf } from '../features/agenda/schedule'
import { subscribePatients } from '../features/patients/api'
import { migrateVisitsToWeekday, subscribeAllVisits } from '../features/visits/api'
import { useAuth } from '../lib/auth'
import { WEEKDAYS, weekdayLabel, type Weekday } from '../lib/dates'
import type { Patient, Visit } from '../types'

const MIGRATE_KEY = 'hosp-visits-weekday-migrated'

export function WeeklyPlanPage() {
  const { practiceId } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, (list) => {
      setPatients(list.filter((p) => p.active))
    })
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    let active = true
    let unsub: (() => void) | undefined

    void (async () => {
      try {
        if (localStorage.getItem(MIGRATE_KEY) !== practiceId) {
          await migrateVisitsToWeekday(practiceId)
          localStorage.setItem(MIGRATE_KEY, practiceId)
        }
      } catch {
        /* ignore */
      }
      if (!active) return
      unsub = subscribeAllVisits(practiceId, setVisits, (e) => setError(e.message))
    })()

    return () => {
      active = false
      unsub?.()
    }
  }, [practiceId])

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>()
    for (const p of patients) m.set(p.id, p)
    return m
  }, [patients])

  const byWeekday = useMemo(() => {
    const map = new Map<Weekday, Visit[]>()
    for (const d of WEEKDAYS) map.set(d.value, [])
    for (const v of visits) {
      if (v.status === 'cancelled') continue
      if (!map.has(v.weekday)) continue
      map.get(v.weekday)!.push(v)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [visits])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Plan</p>
          <h1>Haftalık Plan</h1>
          <p className="muted">Pazartesi – Cumartesi Hasta Sırası</p>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="week-grid">
        {WEEKDAYS.map((d) => {
          const dayVisits = byWeekday.get(d.value) ?? []
          return (
            <section key={d.value} className="panel week-day-card">
              <div className="week-day-head">
                <h2>{d.long}</h2>
                <Link
                  className="btn ghost compact"
                  to={`/?day=${d.value}`}
                  aria-label={`${d.long} düzenle`}
                >
                  Düzenle
                </Link>
              </div>

              {dayVisits.length === 0 ? (
                <p className="muted small">Boş</p>
              ) : (
                <ol className="week-visit-list">
                  {dayVisits.map((visit, index) => {
                    const patient = patientMap.get(visit.patientId)
                    const duration = visit.durationMin || VISIT_DURATION_MIN
                    const end = endTimeOf(visit.startTime, duration)
                    return (
                      <li key={visit.id}>
                        <span className="week-order">{index + 1}</span>
                        <div className="week-visit-body">
                          <strong>{patient?.name ?? 'Hasta'}</strong>
                          <span className="muted small">
                            {visit.startTime} – {end}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )
        })}
      </div>

      <p className="muted small">
        Sırayı değiştirmek için{' '}
        <Link to="/">{weekdayLabel(1)} günlük plana</Link> git.
      </p>
    </div>
  )
}
