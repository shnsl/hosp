import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconRefresh,
  IconToday,
  IconTrash,
} from '../components/Icons'
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
import {
  createVisit,
  deleteVisit,
  subscribeVisitsForDate,
} from '../features/visits/api'
import { useAuth } from '../lib/auth'
import { addDaysIso, formatDateTr, todayIsoDate } from '../lib/dates'
import type { Patient, Visit } from '../types'

export function AgendaPage() {
  const { practiceId } = useAuth()
  const [date, setDate] = useState(todayIsoDate())
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [legs, setLegs] = useState<ScheduleLeg[]>([])

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, (list) => {
      setPatients(list.filter((p) => p.active))
    })
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    setLegs([])
    return subscribeVisitsForDate(practiceId, date, setVisits, (e) =>
      setError(e.message),
    )
  }, [practiceId, date])

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
          date,
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
          date,
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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Ajanda</p>
          <h1>Plan</h1>
          <p className="muted">{formatDateTr(date)}</p>
        </div>
      </header>

      <div className="date-nav">
        <button
          className="btn icon-action"
          type="button"
          aria-label="Önceki gün"
          onClick={() => setDate(addDaysIso(date, -1))}
        >
          <IconChevronLeft />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Tarih"
        />
        <button
          className="btn icon-action"
          type="button"
          aria-label="Sonraki gün"
          onClick={() => setDate(addDaysIso(date, 1))}
        >
          <IconChevronRight />
        </button>
        <button
          className="btn ghost icon-action"
          type="button"
          aria-label="Bugün"
          onClick={() => setDate(todayIsoDate())}
        >
          <IconToday />
        </button>
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

      <section className="panel plan-day">
        <div className="plan-day-head">
          <h2>Günün sırası</h2>
          {sorted.length > 0 && (
            <button
              className="btn icon-action"
              type="button"
              aria-label="Saatleri yenile"
              disabled={scheduling}
              onClick={() => void reschedule(sorted)}
            >
              <IconRefresh />
            </button>
          )}
        </div>
        <p className="muted small plan-hint">
          Sürükleyerek sırayı değiştir; saatler OSRM yol süresiyle otomatik hesaplanır.
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
    </div>
  )
}
