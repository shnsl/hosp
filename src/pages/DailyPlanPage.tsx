import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { IconCheck, IconClose, IconFinishDay, IconPlus, IconRefresh, IconRoute, IconTrash } from '../components/Icons'
import { SortableList } from '../components/SortableList'
import { useConfirm } from '../components/useConfirm'
import {
  buildDaySchedule,
  endTimeOf,
  saveDaySchedule,
  type ScheduleLeg,
} from '../features/agenda/schedule'
import {
  defaultDayScheduleSettings,
  subscribeDayScheduleSettings,
  timingForWeekday,
} from '../features/agenda/daySettings'
import { subscribePatients } from '../features/patients/api'
import { suggestRoute, patientToAcceptWindow, timeToMinutes } from '../features/routing/optimize'
import {
  clearAllAttendance,
  clearAttendance,
  pruneAttendanceOlderThan,
  upsertAttendance,
} from '../features/attendance/api'
import {
  createVisit,
  deleteVisit,
  migrateVisitsToWeekday,
  subscribeAllVisits,
  updateVisit,
} from '../features/visits/api'
import { useAuth } from '../lib/auth'
import {
  WEEKDAYS,
  addDaysIso,
  effectiveVisitStatus,
  isWeekday,
  occurrenceIsoForWeekday,
  todayIsoDate,
  todayWeekday,
  weekdayLabel,
  type Weekday,
} from '../lib/dates'
import type { LatLng, Patient, Visit, VisitStatus } from '../types'

const MIGRATE_KEY = 'hosp-visits-weekday-migrated'

function initialWeekday(param: string | null): Weekday {
  const n = Number(param)
  if (isWeekday(n)) return n
  return todayWeekday()
}

export function DailyPlanPage() {
  const { practiceId } = useAuth()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const [weekday, setWeekday] = useState<Weekday>(() =>
    initialWeekday(searchParams.get('day')),
  )
  const [patients, setPatients] = useState<Patient[]>([])
  const [allVisits, setAllVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [legs, setLegs] = useState<ScheduleLeg[]>([])
  const [startPickerOpen, setStartPickerOpen] = useState(false)
  const [addPatientOpen, setAddPatientOpen] = useState(false)
  const [finishingDay, setFinishingDay] = useState(false)
  const [daySettings, setDaySettings] = useState(defaultDayScheduleSettings)

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
    return subscribeDayScheduleSettings(practiceId, setDaySettings, (e) =>
      setError(e.message),
    )
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
      unsub = subscribeAllVisits(practiceId, setAllVisits, (e) => setError(e.message))
    })()

    return () => {
      active = false
      unsub?.()
    }
  }, [practiceId])

  useEffect(() => {
    setLegs([])
  }, [weekday])

  const visits = useMemo(
    () => allVisits.filter((v) => v.weekday === weekday),
    [allVisits, weekday],
  )

  const weeklyVisitCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of allVisits) {
      m.set(v.patientId, (m.get(v.patientId) ?? 0) + 1)
    }
    return m
  }, [allVisits])

  const dayTiming = useMemo(
    () => timingForWeekday(daySettings, weekday),
    [daySettings, weekday],
  )

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>()
    for (const p of patients) m.set(p.id, p)
    return m
  }, [patients])

  const sorted = useMemo(
    () =>
      [...visits].sort(
        (a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime),
      ),
    [visits],
  )

  const statusCounts = useMemo(() => {
    let done = 0
    let cancelled = 0
    for (const v of sorted) {
      const s = effectiveVisitStatus(v, weekday)
      if (s === 'done') done += 1
      if (s === 'cancelled') cancelled += 1
    }
    return { done, cancelled }
  }, [sorted, weekday])

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

  const daySummary = useMemo(() => {
    if (sorted.length === 0) return null
    const active = sorted.filter(
      (v) => effectiveVisitStatus(v, weekday) !== 'cancelled',
    )
    const last = active[active.length - 1]
    return {
      end: last
        ? endTimeOf(last.startTime, last.durationMin || dayTiming.durationMin)
        : null,
      count: sorted.length,
    }
  }, [sorted, weekday, dayTiming.durationMin])

  async function reschedule(ordered: Visit[]) {
    if (!practiceId) return
    if (ordered.length === 0) {
      setLegs([])
      return
    }
    setScheduling(true)
    setError(null)
    try {
      const skipVisitIds = new Set(
        ordered
          .filter((v) => effectiveVisitStatus(v, weekday) === 'cancelled')
          .map((v) => v.id),
      )
      const schedule = await buildDaySchedule(ordered, patientMap, {
        skipVisitIds,
        dayStart: dayTiming.startTime,
        visitDurationMin: dayTiming.durationMin,
      })
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
          startTime: dayTiming.startTime,
          durationMin: dayTiming.durationMin,
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
          startTime: dayTiming.startTime,
          order: sorted.length,
          durationMin: dayTiming.durationMin,
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
    const ok = await confirm({
      title: 'Plandan çıkar',
      message: `“${name}” bu günün planından silinsin mi?`,
      confirmLabel: 'Sil',
    })
    if (!ok) return
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

  async function setVisitAttendance(visit: Visit, next: VisitStatus) {
    if (!practiceId) return
    const current = effectiveVisitStatus(visit, weekday)
    const status: VisitStatus = current === next ? 'planned' : next
    const statusDate = status === 'planned' ? null : occurrenceIsoForWeekday(weekday)
    try {
      await updateVisit(practiceId, visit.id, { status, statusDate })
      const occ = occurrenceIsoForWeekday(weekday)
      if (status === 'planned') {
        await clearAttendance(practiceId, visit.patientId, occ)
      } else if (status === 'done' || status === 'cancelled') {
        await upsertAttendance(practiceId, visit.patientId, occ, status)
      }
      const updated = sorted.map((v) =>
        v.id === visit.id ? { ...v, status, statusDate } : v,
      )
      await reschedule(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum güncellenemedi')
    }
  }

  async function finishDay() {
    if (!practiceId) return
    const occ = occurrenceIsoForWeekday(weekday)
    const marked = sorted.filter((v) => {
      const s = effectiveVisitStatus(v, weekday)
      return s === 'done' || s === 'cancelled'
    })

    if (marked.length === 0) {
      const ok = await confirm({
        title: 'Özet tablosunu sıfırla',
        message: 'Alındı/iptal işareti yok.\nÖzet tablosundaki tüm kayıtlar silinsin mi?',
        confirmLabel: 'Sıfırla',
      })
      if (!ok) return
      setFinishingDay(true)
      setError(null)
      setNotice(null)
      try {
        const n = await clearAllAttendance(practiceId)
        setNotice(
          n === 0 ? 'Özet tablosu zaten boştu' : `Özet tablosu sıfırlandı · ${n} kayıt silindi`,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tablo sıfırlanamadı')
      } finally {
        setFinishingDay(false)
      }
      return
    }

    const ok = await confirm({
      title: 'Günü bitir',
      message: `${weekdayLabel(weekday)} günü bitirilsin mi?\n${marked.length} kayıt tabloya yazılacak; işaretler sıfırlanır. 2 haftadan eski kayıtlar silinir.`,
      confirmLabel: 'Bitir',
      danger: false,
    })
    if (!ok) return

    setFinishingDay(true)
    setError(null)
    setNotice(null)
    try {
      for (const v of marked) {
        const s = effectiveVisitStatus(v, weekday)
        if (s === 'done' || s === 'cancelled') {
          await upsertAttendance(practiceId, v.patientId, occ, s)
        }
        await updateVisit(practiceId, v.id, { status: 'planned', statusDate: null })
      }

      const cutoff = addDaysIso(todayIsoDate(), -14)
      await pruneAttendanceOlderThan(practiceId, cutoff)

      const reset = sorted.map((v) =>
        marked.some((m) => m.id === v.id)
          ? { ...v, status: 'planned' as const, statusDate: null }
          : v,
      )
      await reschedule(reset)
      setNotice(
        `Gün bitti · ${marked.length} kayıt tutuldu · 2 haftadan eski kayıtlar temizlendi`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gün bitirilemedi')
    } finally {
      setFinishingDay(false)
    }
  }

  async function optimizeOrderWithOsrm(startVisitId: string) {
    if (!practiceId) return
    const active = sorted.filter(
      (v) => effectiveVisitStatus(v, weekday) !== 'cancelled',
    )
    const cancelled = sorted.filter(
      (v) => effectiveVisitStatus(v, weekday) === 'cancelled',
    )
    if (active.length < 2) {
      setError('Sıralama için en az 2 aktif (iptal olmayan) hasta gerekli')
      return
    }
    const startIndex = active.findIndex((v) => v.id === startVisitId)
    if (startIndex < 0) {
      setError('İlk hasta seçilemedi')
      return
    }

    setStartPickerOpen(false)
    setScheduling(true)
    setError(null)
    setNotice(null)
    try {
      const points: LatLng[] = []
      const windows = []
      for (const v of active) {
        const p = patientMap.get(v.patientId)
        if (!p || p.lat == null || p.lng == null) {
          throw new Error('Tüm hastalarda konum olmalı')
        }
        points.push({ lat: p.lat, lng: p.lng })
        windows.push(patientToAcceptWindow(p, weekday))
      }
      const suggestion = await suggestRoute(points, {
        startIndex,
        windows,
        dayStartMin: timeToMinutes(dayTiming.startTime),
        visitDurationMin: dayTiming.durationMin,
      })
      const optimizedActive = suggestion.order.map((i) => active[i]).filter(Boolean)
      if (optimizedActive.length !== active.length) {
        throw new Error('Rota sırası uygulanamadı')
      }
      // İptaller sonda kalsın; aktif rota optimize
      const next = [...optimizedActive, ...cancelled]
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
          <h1>Günlük Plan</h1>
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
        İlk hasta <strong>{dayTiming.startTime}</strong> · her hastada{' '}
        <strong>{dayTiming.durationMin} dk</strong>
        {daySummary ? (
          <>
            {daySummary.end ? (
              <>
                {' '}
                · tahmini bitiş <strong>{daySummary.end}</strong>
              </>
            ) : null}
            {' '}
            · <strong>{daySummary.count}</strong> hasta
          </>
        ) : null}
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
          <h2>
            {weekdayLabel(weekday)} Listesi
            {sorted.length > 0 ? (
              <span className="plan-day-stats muted">
                {' '}
                · {statusCounts.done} alındı · {statusCounts.cancelled} iptal
              </span>
            ) : null}
          </h2>
          <div className="row-actions">
            {sorted.length > 0 ? (
              <>
                <button
                  className="btn icon-action"
                  type="button"
                  aria-label="OSRM ile en iyi sırayı uygula"
                  title="OSRM ile sırala"
                  disabled={
                    scheduling ||
                    sorted.filter((v) => effectiveVisitStatus(v, weekday) !== 'cancelled')
                      .length < 2
                  }
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
              </>
            ) : null}
            <button
              className="btn primary icon-action"
              type="button"
              aria-label="Günü Bitir"
              title="Günü Bitir"
              disabled={finishingDay || scheduling}
              onClick={() => void finishDay()}
            >
              <IconFinishDay />
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="muted">Bu güne henüz hasta eklenmedi.</p>
        ) : (
          <SortableList
            items={sorted}
            onReorder={(ids) => void onReorder(ids)}
            renderItem={(visit, index) => {
              const patient = patientMap.get(visit.patientId)
              const duration = visit.durationMin || dayTiming.durationMin
              const end = endTimeOf(visit.startTime, duration)
              const leg = legAfter.get(visit.id)
              const att = effectiveVisitStatus(visit, weekday)
              const weekCount = weeklyVisitCount.get(visit.patientId) ?? 0
              const weekTone =
                weekCount === 2
                  ? 'is-week-2'
                  : weekCount === 3
                    ? 'is-week-3'
                    : 'is-week-other'
              return (
                <div
                  className={`plan-item ${att === 'done' ? 'is-done' : ''} ${att === 'cancelled' ? 'is-cancelled' : ''}`}
                >
                  <div className="plan-item-top">
                    <div className="plan-row-main">
                      <span className="visit-order plan-order">{index + 1}</span>
                      <div>
                        <p className={`visit-name plan-name ${weekTone}`}>
                          {patient?.name ?? 'Hasta'}
                        </p>
                        {att !== 'cancelled' ? (
                          <p className="muted plan-time">
                            {visit.startTime} – {end}
                          </p>
                        ) : (
                          <p className="muted small plan-time">İptal — saatten çıkarıldı</p>
                        )}
                        {(!patient || patient.lat == null || patient.lng == null) && (
                          <p className="warn small">Konum yok</p>
                        )}
                      </div>
                    </div>
                    <div className="plan-item-actions">
                      <button
                        className={`btn icon-action ${att === 'done' ? 'is-done-btn' : ''}`}
                        type="button"
                        aria-label="Alındı"
                        title="Alındı"
                        data-no-drag
                        onClick={() => void setVisitAttendance(visit, 'done')}
                      >
                        <IconCheck />
                      </button>
                      <button
                        className={`btn icon-action ${att === 'cancelled' ? 'is-cancel-btn' : ''}`}
                        type="button"
                        aria-label="İptal / alınamadı"
                        title="İptal / alınamadı"
                        data-no-drag
                        onClick={() => void setVisitAttendance(visit, 'cancelled')}
                      >
                        <IconClose />
                      </button>
                      <button
                        className="btn danger icon-action"
                        type="button"
                        aria-label="Çıkar"
                        data-no-drag
                        onClick={() => void removeVisit(visit)}
                      >
                        <IconTrash />
                      </button>
                    </div>
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

      <section className="panel add-patient-panel">
        <button
          type="button"
          className="add-patient-toggle"
          aria-expanded={addPatientOpen}
          onClick={() => setAddPatientOpen((o) => !o)}
        >
          <h2>Hasta Ekle</h2>
          <span className="muted small" aria-hidden>
            {addPatientOpen ? '▲' : '▼'}
          </span>
        </button>
        {addPatientOpen ? (
          patients.length === 0 ? (
            <p className="muted">
              Önce <Link to="/patients">hasta kaydı</Link> oluştur.
            </p>
          ) : availablePatients.length === 0 ? (
            <p className="muted">Tüm aktif hastalar bu güne eklendi.</p>
          ) : (
            <ul className="patient-pick-list">
              {availablePatients.map((p) => {
                const weekCount = weeklyVisitCount.get(p.id) ?? 0
                const weekTone =
                  weekCount === 2
                    ? 'is-week-2'
                    : weekCount === 3
                      ? 'is-week-3'
                      : 'is-week-other'
                return (
                  <li key={p.id} className={weekTone}>
                    <strong className={`pick-name plan-name ${weekTone}`}>{p.name}</strong>
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
                )
              })}
            </ul>
          )
        ) : null}
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
                <h2>İlk Hasta Kim Olsun?</h2>
                <p className="muted small">Seçtiğin Hasta Sabah İlk Ziyaret Olur</p>
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
              {sorted
                .filter((v) => effectiveVisitStatus(v, weekday) !== 'cancelled')
                .map((visit, index) => {
                const patient = patientMap.get(visit.patientId)
                return (
                  <li key={visit.id}>
                    <button
                      type="button"
                      className="start-picker-item"
                      disabled={scheduling || patient?.lat == null || patient?.lng == null}
                      onClick={() => void optimizeOrderWithOsrm(visit.id)}
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
      {confirmDialog}
    </div>
  )
}
