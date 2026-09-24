import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { IconClose, IconPlus, IconRefresh, IconRoute, IconTrash } from '../components/Icons'
import { SortableList } from '../components/SortableList'
import {
  DAY_START,
  VISIT_DURATION_MIN,
  buildDaySchedule,
  endTimeOf,
  saveDaySchedule,
  type ScheduleLeg,
} from '../features/agenda/schedule'
import { subscribePatients } from '../features/patients/api'
import { suggestRoute, patientToAcceptWindow, timeToMinutes } from '../features/routing/optimize'
import {
  createVisit,
  deleteVisit,
  migrateVisitsToWeekday,
  subscribeVisitsForWeekday,
} from '../features/visits/api'
import { useAuth } from '../lib/auth'
import {
  WEEKDAYS,
  isWeekday,
  todayWeekday,
  weekdayLabel,
  type Weekday,
} from '../lib/dates'
import type { LatLng, Patient, Visit } from '../types'

const MIGRATE_KEY = 'hosp-visits-weekday-migrated'

function initialWeekday(param: string | null): Weekday {
  const n = Number(param)
  if (isWeekday(n)) return n
  return todayWeekday()
}

export function DailyPlanPage() {
  const { practiceId } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [weekday, setWeekday] = useState<Weekday>(() =>
    initialWeekday(searchParams.get('day')),
  )
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [legs, setLegs] = useState<ScheduleLeg[]>([])
  const [startPickerOpen, setStartPickerOpen] = useState(false)

  useEffect(() => {
    const fromUrl = initialWeekday(searchParams.get('day'))
    setWeekday(fromUrl)
  }, [searchParams])

  function selectWeekday(next: Weekday) {
    setWeekday(next)
    setSearchParams(next === todayWeekday() ? {} : { day: String(next) }, { replace: true })
  }

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
      setLegs([])
      unsub = subscribeVisitsForWeekday(practiceId, weekday, setVisits, (e) =>
        setError(e.message),
      )
    })()

    return () => {
      active = false
      unsub?.()
    }
  }, [practiceId, weekday])

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>()
    for (const p of patients) m.set(p.id, p)
    return m
  }, [patients])

  const sorted = useMemo(
    () =>
      [...visits]
        .filter((v) => v.status !== 'cancelled')
        .sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime)),
    [visits],
  )

  const plannedPatientIds = useMemo(
    () => new Set(sorted.map((v) => v.patientId)),
    [sorted],
  )

  const availablePatients = useMemo(
    () => patients.filter((p) => !plannedPatientIds.has(p.id)),
    [patients, plannedPatientIds],
  )

  const legAfter = useMemo(() => {
    const m = new Map<string, ScheduleLeg>()
    for (const leg of legs) m.set(leg.afterVisitId, leg)
    return m
  }, [legs])

  async function reschedule(ordered: Visit[]) {
    if (!practiceId) return
    if (ordered.length === 0) {
      setLegs([])
      return
    }
    setScheduling(true)
    setError(null)
    try {
      const schedule = await buildDaySchedule(ordered, patientMap)
      await saveDaySchedule(practiceId, schedule)
      setLegs(schedule.legs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saatler hesaplanamadı')
    } finally {
      setScheduling(false)
    }
  }

  async function addPatient(patient: Patient) {
    if (!practiceId) return
    setError(null)
    setBusyId(patient.id)
    try {
      const newId = await createVisit(
        practiceId,
        {
          patientId: patient.id,
          weekday,
          startTime: DAY_START,
          durationMin: VISIT_DURATION_MIN,
          status: 'planned',
        },
        sorted.length,
      )
      const next: Visit[] = [
        ...sorted,
        {
          id: newId,
          patientId: patient.id,
          weekday,
          startTime: DAY_START,
          order: sorted.length,
          durationMin: VISIT_DURATION_MIN,
          status: 'planned',
          createdAt: '',
          updatedAt: '',
        },
      ]
      await reschedule(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusyId(null)
    }
  }

  async function removeVisit(visit: Visit) {
    if (!practiceId) return
    const name = patientMap.get(visit.patientId)?.name ?? 'Hasta'
    if (!window.confirm(`“${name}” plandan çıkarılsın mı?`)) return
    setError(null)
    try {
      await deleteVisit(practiceId, visit.id)
      await reschedule(sorted.filter((v) => v.id !== visit.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  async function onReorder(orderedIds: string[]) {
    const byId = new Map(sorted.map((v) => [v.id, v]))
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((v): v is Visit => Boolean(v))
    await reschedule(next)
  }

  async function optimizeOrderWithOsrm(startIndex: number) {
    if (!practiceId || sorted.length < 2) return
    setStartPickerOpen(false)
    setScheduling(true)
    setError(null)
    setNotice(null)
    try {
      const points: LatLng[] = []
      const windows = []
      for (const v of sorted) {
        const p = patientMap.get(v.patientId)
        if (!p || p.lat == null || p.lng == null) {
          throw new Error('Tüm hastalarda konum olmalı')
        }
        points.push({ lat: p.lat, lng: p.lng })
        windows.push(patientToAcceptWindow(p))
      }
      const suggestion = await suggestRoute(points, {
        startIndex,
        windows,
        dayStartMin: timeToMinutes(DAY_START),
        visitDurationMin: VISIT_DURATION_MIN,
      })
      const next = suggestion.order.map((i) => sorted[i]).filter(Boolean)
      if (next.length !== sorted.length) {
        throw new Error('Rota sırası uygulanamadı')
      }
      await reschedule(next)
      if (suggestion.warning) {
        setNotice(suggestion.warning)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rota önerisi başarısız')
      setScheduling(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Plan</p>
          <h1>Günlük plan</h1>
          <p className="muted">
            {weekdayLabel(weekday)} — her hafta aynı sıra
          </p>
        </div>
      </header>

      <div className="weekday-nav" role="tablist" aria-label="Hafta günü">
        {WEEKDAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            role="tab"
            aria-selected={weekday === d.value}
            className={`weekday-chip ${weekday === d.value ? 'is-active' : ''}`}
            onClick={() => selectWeekday(d.value)}
          >
            {d.short}
          </button>
        ))}
      </div>

      <p className="muted small schedule-rules">
        İlk hasta <strong>{DAY_START}</strong> · her hastada{' '}
        <strong>{VISIT_DURATION_MIN} dk</strong> · ara yol süresi OSRM (araç)
        {scheduling ? ' · hesaplanıyor…' : ''}
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="warn" role="status">
          {notice}
        </p>
      )}

      <section className="panel plan-day">
        <div className="plan-day-head">
          <h2>{weekdayLabel(weekday)} sırası</h2>
          {sorted.length > 0 && (
            <div className="row-actions">
              <button
                className="btn icon-action"
                type="button"
                aria-label="OSRM ile en iyi sırayı uygula"
                title="OSRM ile sırala"
                disabled={scheduling || sorted.length < 2}
                onClick={() => setStartPickerOpen(true)}
              >
                <IconRoute />
              </button>
              <button
                className="btn icon-action"
                type="button"
                aria-label="Saatleri yenile"
                title="Saatleri yenile"
                disabled={scheduling}
                onClick={() => void reschedule(sorted)}
              >
                <IconRefresh />
              </button>
            </div>
          )}
        </div>
        <p className="muted small plan-hint">
          Sürükleyerek sırayı değiştir; bu düzen her {weekdayLabel(weekday)} tekrarlanır.
        </p>

        {sorted.length === 0 ? (
          <p className="muted">Bu güne henüz hasta eklenmedi.</p>
        ) : (
          <SortableList
            items={sorted}
            onReorder={(ids) => void onReorder(ids)}
            renderItem={(visit, index) => {
              const patient = patientMap.get(visit.patientId)
              const duration = visit.durationMin || VISIT_DURATION_MIN
              const end = endTimeOf(visit.startTime, duration)
              const leg = legAfter.get(visit.id)
              return (
                <div className="plan-item">
                  <div className="plan-item-top">
                    <div className="plan-row-main">
                      <span className="visit-order plan-order">{index + 1}</span>
                      <div>
                        <p className="visit-name plan-name">{patient?.name ?? 'Hasta'}</p>
                        <p className="muted plan-time">
                          {visit.startTime} – {end}
                        </p>
                        {(!patient || patient.lat == null || patient.lng == null) && (
                          <p className="warn small">Konum yok</p>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn danger icon-action"
                      type="button"
                      aria-label="Çıkar"
                      onClick={() => void removeVisit(visit)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                  {leg && (
                    <p className="leg-hint muted small">
                      Sonraki: {leg.distanceKm} km · {leg.durationMin} dk
                    </p>
                  )}
                </div>
              )
            }}
          />
        )}
      </section>

      <section className="panel">
        <h2>Hasta ekle</h2>
        {patients.length === 0 ? (
          <p className="muted">
            Önce <Link to="/patients">hasta kaydı</Link> oluştur.
          </p>
        ) : availablePatients.length === 0 ? (
          <p className="muted">Tüm aktif hastalar bu güne eklendi.</p>
        ) : (
          <ul className="patient-pick-list">
            {availablePatients.map((p) => (
              <li key={p.id}>
                <strong className="pick-name">{p.name}</strong>
                <button
                  className="btn primary icon-action"
                  type="button"
                  aria-label="Ekle"
                  disabled={busyId === p.id || scheduling || p.lat == null || p.lng == null}
                  onClick={() => void addPatient(p)}
                >
                  {busyId === p.id ? '…' : <IconPlus />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {startPickerOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setStartPickerOpen(false)}
        >
          <div
            className="modal start-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="İlk hastayı seç"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Rota</p>
                <h2>İlk hasta kim olsun?</h2>
                <p className="muted small">Seçtiğin hasta sabah ilk ziyaret olur</p>
              </div>
              <button
                className="btn icon-action"
                type="button"
                aria-label="Kapat"
                onClick={() => setStartPickerOpen(false)}
              >
                <IconClose />
              </button>
            </header>
            <ul className="start-picker-list">
              {sorted.map((visit, index) => {
                const patient = patientMap.get(visit.patientId)
                return (
                  <li key={visit.id}>
                    <button
                      type="button"
                      className="start-picker-item"
                      disabled={scheduling || patient?.lat == null || patient?.lng == null}
                      onClick={() => void optimizeOrderWithOsrm(index)}
                    >
                      <span className="week-order">{index + 1}</span>
                      <span className="pick-name">{patient?.name ?? 'Hasta'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
