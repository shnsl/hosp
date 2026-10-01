import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CoordsField } from '../components/CoordsField'
import { IconCheck, IconClose, IconEdit, IconFinishDay, IconMap, IconPlus, IconRefresh, IconRoute, IconTrash } from '../components/Icons'
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
import { advancePatientSessionOnDone, subscribePatients } from '../features/patients/api'
import { subscribeStops } from '../features/stops/api'
import {
  suggestRoute,
  patientToAcceptWindow,
  timeToMinutes,
  visitFitsAcceptWindow,
} from '../features/routing/optimize'
import { tryParseLatLng, formatLatLng } from '../features/routing/coords'
import {
  clearAllAttendance,
  clearAttendance,
  pruneAttendanceOlderThan,
  upsertAttendance,
} from '../features/attendance/api'
import {
  createStopVisit,
  createVisit,
  deleteVisit,
  deleteVisitsForWeekday,
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
import { isStopVisit, type LatLng, type Patient, type Stop, type Visit, type VisitStatus } from '../types'

const MIGRATE_KEY = 'hosp-visits-weekday-migrated'
const DAY_CLEAR_HOLD_MS = 1000
const HOLD_MOVE_CANCEL_PX = 12

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
  const [stops, setStops] = useState<Stop[]>([])
  const [allVisits, setAllVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [legs, setLegs] = useState<ScheduleLeg[]>([])
  const [startPickerOpen, setStartPickerOpen] = useState(false)
  const [addPatientOpen, setAddPatientOpen] = useState(false)
  const [addStopOpen, setAddStopOpen] = useState(false)
  const [libraryStop, setLibraryStop] = useState<Stop | null>(null)
  const [libraryWaitMin, setLibraryWaitMin] = useState('10')
  const [libraryAfterPatient, setLibraryAfterPatient] = useState('0')
  const [libraryWaitError, setLibraryWaitError] = useState<string | null>(null)
  const [pendingPatient, setPendingPatient] = useState<Patient | null>(null)
  const [patientAfter, setPatientAfter] = useState('0')
  const [patientInsertError, setPatientInsertError] = useState<string | null>(null)
  const [stopModalOpen, setStopModalOpen] = useState(false)
  const [editingStopVisit, setEditingStopVisit] = useState<Visit | null>(null)
  const [stopName, setStopName] = useState('')
  const [stopCoords, setStopCoords] = useState('')
  const [stopWaitMin, setStopWaitMin] = useState('10')
  const [stopAfterPatient, setStopAfterPatient] = useState('0')
  const [stopBusy, setStopBusy] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const [finishingDay, setFinishingDay] = useState(false)
  const [daySettings, setDaySettings] = useState(defaultDayScheduleSettings)
  const holdTimerRef = useRef<number | null>(null)
  const holdStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressOpenedRef = useRef(false)

  useEffect(() => {
    const fromUrl = initialWeekday(searchParams.get('day'))
    setWeekday(fromUrl)
  }, [searchParams])

  function selectWeekday(next: Weekday) {
    setWeekday(next)
    setSearchParams(next === todayWeekday() ? {} : { day: String(next) }, { replace: true })
  }

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  function onDayPointerDown(e: ReactPointerEvent<HTMLButtonElement>, day: Weekday) {
    if (e.button !== 0) return
    longPressOpenedRef.current = false
    holdStartRef.current = { x: e.clientX, y: e.clientY }
    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      longPressOpenedRef.current = true
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(20)
      }
      void clearDayList(day)
    }, DAY_CLEAR_HOLD_MS)
  }

  function onDayPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const start = holdStartRef.current
    if (!start || holdTimerRef.current == null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > HOLD_MOVE_CANCEL_PX * HOLD_MOVE_CANCEL_PX) {
      clearHoldTimer()
    }
  }

  function onDayPointerEnd() {
    clearHoldTimer()
    holdStartRef.current = null
  }

  function onDayClick(day: Weekday) {
    if (longPressOpenedRef.current) {
      longPressOpenedRef.current = false
      return
    }
    selectWeekday(day)
  }

  async function clearDayList(day: Weekday) {
    if (!practiceId) return
    const dayVisits = allVisits.filter((v) => v.weekday === day)
    if (dayVisits.length === 0) {
      setNotice(`${weekdayLabel(day)} listesi zaten boş`)
      selectWeekday(day)
      return
    }
    const ok = await confirm({
      title: 'Listeyi temizle',
      message: `${weekdayLabel(day)} listesi temizlensin mi?\n${dayVisits.length} kayıt silinecek.`,
      confirmLabel: 'Evet',
    })
    if (!ok) return
    setError(null)
    setNotice(null)
    try {
      await deleteVisitsForWeekday(practiceId, day)
      setLegs([])
      selectWeekday(day)
      setNotice(`${weekdayLabel(day)} listesi temizlendi`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liste temizlenemedi')
    }
  }

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, (list) => {
      setPatients(list.filter((p) => p.active))
    })
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    return subscribeStops(practiceId, setStops, (e) => setError(e.message))
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

  const visitRouteKey = useMemo(
    () =>
      [...visits]
        .sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime))
        .map((v) => `${v.id}:${v.order}:${v.patientId}:${v.status}`)
        .join('|'),
    [visits],
  )

  const weeklyVisitCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of allVisits) {
      if (isStopVisit(v) || !v.patientId) continue
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
      if (isStopVisit(v)) continue
      const s = effectiveVisitStatus(v, weekday)
      if (s === 'done') done += 1
      if (s === 'cancelled') cancelled += 1
    }
    return { done, cancelled }
  }, [sorted, weekday])

  const patientSlotCount = useMemo(
    () => sorted.filter((v) => !isStopVisit(v)).length,
    [sorted],
  )

  /** Sıra no → hasta adı (duraklar atlanır); select etiketleri için */
  const patientInsertOptions = useMemo(() => {
    const rows: Array<{ n: number; name: string }> = []
    let n = 0
    for (const v of sorted) {
      if (isStopVisit(v)) continue
      n += 1
      rows.push({
        n,
        name: patientMap.get(v.patientId)?.name ?? `Hasta ${n}`,
      })
    }
    return rows
  }, [sorted, patientMap])

  const plannedPatientIds = useMemo(
    () =>
      new Set(
        sorted.filter((v) => !isStopVisit(v) && v.patientId).map((v) => v.patientId),
      ),
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
    let driveKm =
      Math.round(legs.reduce((sum, leg) => sum + leg.distanceKm, 0) * 10) / 10
    let driveMin = legs.reduce((sum, leg) => sum + leg.durationMin, 0)
    if (legs.length === 0 && active.length >= 2) {
      for (let i = 0; i < active.length - 1; i++) {
        const endMin = timeToMinutes(
          endTimeOf(active[i].startTime, active[i].durationMin || dayTiming.durationMin),
        )
        const nextMin = timeToMinutes(active[i + 1].startTime)
        driveMin += Math.max(0, nextMin - endMin)
      }
    }
    return {
      end: last
        ? endTimeOf(last.startTime, last.durationMin || dayTiming.durationMin)
        : null,
      count: sorted.filter((v) => !isStopVisit(v)).length,
      driveKm,
      driveMin,
    }
  }, [sorted, weekday, dayTiming.durationMin, legs])

  useEffect(() => {
    if (!practiceId || sorted.length < 2 || patientMap.size === 0) return
    let cancelled = false
    void (async () => {
      try {
        const skipVisitIds = new Set(
          sorted
            .filter((v) => effectiveVisitStatus(v, weekday) === 'cancelled')
            .map((v) => v.id),
        )
        const schedule = await buildDaySchedule(sorted, patientMap, {
          skipVisitIds,
          dayStart: dayTiming.startTime,
          visitDurationMin: dayTiming.durationMin,
        })
        if (!cancelled) setLegs(schedule.legs)
      } catch {
        /* özet satırı boşluklardan dakikayı yine gösterir */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    practiceId,
    weekday,
    visitRouteKey,
    patientMap,
    dayTiming.startTime,
    dayTiming.durationMin,
    sorted,
  ])

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

  async function addPatient() {
    if (!practiceId || !pendingPatient) return
    setError(null)
    setPatientInsertError(null)
    const afterNum = Number(patientAfter)
    if (!Number.isInteger(afterNum) || afterNum < 0 || afterNum > patientSlotCount) {
      setPatientInsertError('Eklenme sırası geçersiz')
      return
    }
    const insertAt = insertIndexAfterPatient(afterNum, sorted)
    setBusyId(pendingPatient.id)
    try {
      const newId = await createVisit(
        practiceId,
        {
          patientId: pendingPatient.id,
          weekday,
          startTime: dayTiming.startTime,
          durationMin: dayTiming.durationMin,
          status: 'planned',
        },
        insertAt,
      )
      const visit: Visit = {
        id: newId,
        patientId: pendingPatient.id,
        weekday,
        startTime: dayTiming.startTime,
        order: insertAt,
        durationMin: dayTiming.durationMin,
        status: 'planned',
        kind: 'patient',
        createdAt: '',
        updatedAt: '',
      }
      const next = [...sorted]
      next.splice(insertAt, 0, visit)
      closePatientInsertPrompt()
      await reschedule(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusyId(null)
    }
  }

  function openPatientInsertPrompt(patient: Patient) {
    setPendingPatient(patient)
    setPatientAfter(String(patientSlotCount))
    setPatientInsertError(null)
  }

  function closePatientInsertPrompt() {
    setPendingPatient(null)
    setPatientInsertError(null)
  }

  function openStopModal() {
    setEditingStopVisit(null)
    setStopName('')
    setStopCoords('')
    setStopWaitMin('10')
    setStopAfterPatient(String(patientSlotCount))
    setStopError(null)
    setStopModalOpen(true)
  }

  function openEditStop(visit: Visit) {
    if (!isStopVisit(visit)) return
    const idx = sorted.findIndex((v) => v.id === visit.id)
    let afterNum = 0
    if (idx > 0) {
      for (let i = 0; i < idx; i++) {
        if (!isStopVisit(sorted[i])) afterNum += 1
      }
    }
    setEditingStopVisit(visit)
    setStopName(visit.stopName ?? '')
    setStopCoords(
      visit.stopLat != null && visit.stopLng != null
        ? formatLatLng(visit.stopLat, visit.stopLng)
        : '',
    )
    setStopWaitMin(String(visit.durationMin || 10))
    setStopAfterPatient(String(afterNum))
    setStopError(null)
    setStopModalOpen(true)
  }

  function closeStopModal() {
    setStopModalOpen(false)
    setEditingStopVisit(null)
    setStopError(null)
    setStopBusy(false)
  }

  function insertIndexAfterPatient(afterPatientNum: number, list: Visit[]): number {
    if (afterPatientNum <= 0) return 0
    let seen = 0
    for (let i = 0; i < list.length; i++) {
      if (isStopVisit(list[i])) continue
      seen += 1
      if (seen === afterPatientNum) return i + 1
    }
    return list.length
  }

  function openLibraryStopPrompt(stop: Stop) {
    setLibraryStop(stop)
    setLibraryWaitMin(String(stop.waitMin))
    setLibraryAfterPatient(String(patientSlotCount))
    setLibraryWaitError(null)
  }

  function closeLibraryStopPrompt() {
    setLibraryStop(null)
    setLibraryWaitError(null)
  }

  async function addStopFromLibrary() {
    if (!practiceId || !libraryStop) return
    setError(null)
    setLibraryWaitError(null)
    const wait = Number(libraryWaitMin)
    if (!Number.isInteger(wait) || wait < 1 || wait > 60) {
      setLibraryWaitError('Bekleme 1–60 dk olmalı')
      return
    }
    const afterNum = Number(libraryAfterPatient)
    if (!Number.isInteger(afterNum) || afterNum < 0 || afterNum > patientSlotCount) {
      setLibraryWaitError('Eklenme sırası geçersiz')
      return
    }
    const insertAt = insertIndexAfterPatient(afterNum, sorted)
    setBusyId(libraryStop.id)
    try {
      const newId = await createStopVisit(practiceId, {
        weekday,
        startTime: dayTiming.startTime,
        order: insertAt,
        stopName: libraryStop.name,
        stopLat: libraryStop.lat,
        stopLng: libraryStop.lng,
        durationMin: wait,
      })
      const stopVisit: Visit = {
        id: newId,
        patientId: '',
        weekday,
        startTime: dayTiming.startTime,
        order: insertAt,
        durationMin: wait,
        status: 'planned',
        kind: 'stop',
        stopName: libraryStop.name,
        stopLat: libraryStop.lat,
        stopLng: libraryStop.lng,
        createdAt: '',
        updatedAt: '',
      }
      const next = [...sorted]
      next.splice(insertAt, 0, stopVisit)
      closeLibraryStopPrompt()
      await reschedule(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durak eklenemedi')
    } finally {
      setBusyId(null)
    }
  }

  async function addStop() {
    if (!practiceId) return
    setStopBusy(true)
    setStopError(null)
    try {
      const name = stopName.trim()
      if (!name) throw new Error('Durak adı gerekli')
      const parsed = tryParseLatLng(stopCoords)
      if (!parsed) throw new Error('Haritadan konum seç')
      const wait = Number(stopWaitMin)
      if (!Number.isInteger(wait) || wait < 1 || wait > 60) {
        throw new Error('Bekleme 1–60 dk olmalı')
      }
      const afterNum = Number(stopAfterPatient)
      if (!Number.isInteger(afterNum) || afterNum < 0 || afterNum > patientSlotCount) {
        throw new Error('Eklenme sırası geçersiz')
      }

      if (editingStopVisit) {
        const without = sorted.filter((v) => v.id !== editingStopVisit.id)
        const insertAt = insertIndexAfterPatient(afterNum, without)
        await updateVisit(practiceId, editingStopVisit.id, {
          stopName: name,
          stopLat: parsed.lat,
          stopLng: parsed.lng,
          durationMin: wait,
          order: insertAt,
        })
        const updated: Visit = {
          ...editingStopVisit,
          stopName: name,
          stopLat: parsed.lat,
          stopLng: parsed.lng,
          durationMin: wait,
          order: insertAt,
        }
        const next = [...without]
        next.splice(insertAt, 0, updated)
        closeStopModal()
        await reschedule(next)
        return
      }

      const insertAt = insertIndexAfterPatient(afterNum, sorted)
      const newId = await createStopVisit(practiceId, {
        weekday,
        startTime: dayTiming.startTime,
        order: insertAt,
        stopName: name,
        stopLat: parsed.lat,
        stopLng: parsed.lng,
        durationMin: wait,
      })
      const stopVisit: Visit = {
        id: newId,
        patientId: '',
        weekday,
        startTime: dayTiming.startTime,
        order: insertAt,
        durationMin: wait,
        status: 'planned',
        kind: 'stop',
        stopName: name,
        stopLat: parsed.lat,
        stopLng: parsed.lng,
        createdAt: '',
        updatedAt: '',
      }
      const next = [...sorted]
      next.splice(insertAt, 0, stopVisit)
      closeStopModal()
      await reschedule(next)
    } catch (err) {
      setStopError(
        err instanceof Error
          ? err.message
          : editingStopVisit
            ? 'Durak güncellenemedi'
            : 'Durak eklenemedi',
      )
    } finally {
      setStopBusy(false)
    }
  }

  async function removeVisit(visit: Visit) {
    if (!practiceId) return
    const name = isStopVisit(visit)
      ? visit.stopName ?? 'Durak'
      : patientMap.get(visit.patientId)?.name ?? 'Hasta'
    const ok = await confirm({
      title: isStopVisit(visit) ? 'Durağı sil' : 'Plandan çıkar',
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
    if (!practiceId || isStopVisit(visit)) return
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

      // Alındı’ya geçişte seans hakkını ilerlet
      if (status === 'done' && current !== 'done') {
        const patient = patientMap.get(visit.patientId)
        if (patient) {
          const adv = await advancePatientSessionOnDone(practiceId, patient)
          if (adv.exhausted) {
            await confirm({
              title: 'Hak bitti',
              message: `“${patient.name}” için 3 dosya / seans hakkı dolu.\nYeni seans hakkı yok.`,
              confirmLabel: 'Tamam',
            })
          }
        }
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
      if (isStopVisit(v)) return false
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
        if (isStopVisit(v)) {
          if (v.stopLat == null || v.stopLng == null) {
            throw new Error(`“${v.stopName ?? 'Durak'}” konum eksik`)
          }
          points.push({ lat: v.stopLat, lng: v.stopLng })
          windows.push({ fromMin: null, toMin: null })
          continue
        }
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
            title={`${d.long} — basılı tutarak listeyi temizle`}
            onClick={() => onDayClick(d.value)}
            onPointerDown={(e) => onDayPointerDown(e, d.value)}
            onPointerMove={onDayPointerMove}
            onPointerUp={onDayPointerEnd}
            onPointerCancel={onDayPointerEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            {d.short}
          </button>
        ))}
      </div>

      <p className="muted small schedule-rules">
        <strong>{dayTiming.startTime}</strong> ·{' '}
        <strong>{dayTiming.durationMin} dk</strong>
        {daySummary ? (
          <>
            {daySummary.end ? (
              <>
                {' '}
                · <strong>{daySummary.end}</strong>
              </>
            ) : null}
            {' '}
            · <strong>{daySummary.count}</strong> hasta
            {daySummary.driveMin > 0 || daySummary.driveKm > 0 ? (
              <>
                {' '}
                · <strong>{daySummary.driveKm} km</strong> ·{' '}
                <strong>{daySummary.driveMin} dk</strong>
              </>
            ) : null}
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
            <button
              className="btn icon-action"
              type="button"
              aria-label="Durak ekle"
              title="Durak ekle"
              disabled={scheduling || stopBusy}
              onClick={openStopModal}
            >
              <IconMap />
            </button>
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
              const stop = isStopVisit(visit)
              const patient = stop ? undefined : patientMap.get(visit.patientId)
              const duration = stop
                ? Math.max(1, visit.durationMin || 1)
                : visit.durationMin || dayTiming.durationMin
              const end = endTimeOf(visit.startTime, duration)
              const leg = legAfter.get(visit.id)
              const att = effectiveVisitStatus(visit, weekday)
              const weekCount = stop ? 0 : weeklyVisitCount.get(visit.patientId) ?? 0
              const weekTone =
                weekCount === 2
                  ? 'is-week-2'
                  : weekCount === 3
                    ? 'is-week-3'
                    : 'is-week-other'
              const patientNo = stop
                ? 0
                : sorted
                    .slice(0, index + 1)
                    .filter((v) => !isStopVisit(v)).length
              const acceptOk =
                !stop && patient
                  ? visitFitsAcceptWindow(patient, visit.startTime, weekday)
                  : null
              return (
                <div
                  className={`plan-item ${stop ? 'is-stop' : ''} ${!stop && att === 'done' ? 'is-done' : ''} ${!stop && att === 'cancelled' ? 'is-cancelled' : ''}`}
                >
                  <div className="plan-item-top">
                    <div className="plan-row-main">
                      {stop ? (
                        <span className="visit-order plan-order is-stop-order" aria-label="Durak">
                          ·
                        </span>
                      ) : (
                        <span className="visit-order plan-order">{patientNo}</span>
                      )}
                      <div>
                        <p className={`visit-name plan-name ${stop ? 'is-stop-name' : weekTone}`}>
                          {stop ? visit.stopName || 'Durak' : patient?.name ?? 'Hasta'}
                        </p>
                        {stop ? (
                          <p className="muted plan-time">
                            {visit.startTime} – {end} · bekleme {duration} dk
                          </p>
                        ) : att !== 'cancelled' ? (
                          <p className="muted plan-time">
                            {visit.startTime} – {end}
                          </p>
                        ) : (
                          <p className="muted small plan-time">İptal — saatten çıkarıldı</p>
                        )}
                        {!stop && (!patient || patient.lat == null || patient.lng == null) && (
                          <p className="warn small">Konum yok</p>
                        )}
                        {stop && (visit.stopLat == null || visit.stopLng == null) && (
                          <p className="warn small">Konum yok</p>
                        )}
                      </div>
                    </div>
                    <div className="plan-item-actions">
                      {!stop ? (
                        <>
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
                        </>
                      ) : (
                        <button
                          className="btn icon-action"
                          type="button"
                          aria-label="Durağı düzenle"
                          title="Düzenle"
                          data-no-drag
                          onClick={() => openEditStop(visit)}
                        >
                          <IconEdit />
                        </button>
                      )}
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
                      {acceptOk != null ? (
                        <span
                          className={`accept-dot ${acceptOk ? 'is-ok' : 'is-warn'}`}
                          title={
                            acceptOk
                              ? 'İstisna saatine uyuyor'
                              : 'İstisna saatine uymuyor'
                          }
                          aria-label={
                            acceptOk
                              ? 'İstisna saatine uyuyor'
                              : 'İstisna saatine uymuyor'
                          }
                        />
                      ) : null}
                    </p>
                  )}
                  {!leg && acceptOk != null && att !== 'cancelled' ? (
                    <p className="leg-hint muted small accept-only">
                      <span
                        className={`accept-dot ${acceptOk ? 'is-ok' : 'is-warn'}`}
                        title={
                          acceptOk
                            ? 'İstisna saatine uyuyor'
                            : 'İstisna saatine uymuyor'
                        }
                        aria-label={
                          acceptOk
                            ? 'İstisna saatine uyuyor'
                            : 'İstisna saatine uymuyor'
                        }
                      />
                    </p>
                  ) : null}
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
                      onClick={() => openPatientInsertPrompt(p)}
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

      <section className="panel add-patient-panel">
        <button
          type="button"
          className="add-patient-toggle"
          aria-expanded={addStopOpen}
          onClick={() => setAddStopOpen((o) => !o)}
        >
          <h2>Durak Ekle</h2>
          <span className="muted small" aria-hidden>
            {addStopOpen ? '▲' : '▼'}
          </span>
        </button>
        {addStopOpen ? (
          stops.length === 0 ? (
            <p className="muted">
              Önce <Link to="/patients">hasta listesinden</Link> durak kaydı oluştur.
            </p>
          ) : (
            <ul className="patient-pick-list">
              {stops.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong className="pick-name is-stop-name">{s.name}</strong>
                    <p className="muted small">{s.waitMin} dk bekleme</p>
                  </div>
                  <button
                    className="btn primary icon-action"
                    type="button"
                    aria-label="Ekle"
                    disabled={busyId === s.id || scheduling}
                    onClick={() => openLibraryStopPrompt(s)}
                  >
                    {busyId === s.id ? '…' : <IconPlus />}
                  </button>
                </li>
              ))}
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
                .map((visit, index, activeList) => {
                const stop = isStopVisit(visit)
                const patient = stop ? undefined : patientMap.get(visit.patientId)
                const label = stop
                  ? visit.stopName || 'Durak'
                  : patient?.name ?? 'Hasta'
                const hasCoords = stop
                  ? visit.stopLat != null && visit.stopLng != null
                  : patient?.lat != null && patient?.lng != null
                const patientNo = stop
                  ? null
                  : activeList.slice(0, index + 1).filter((v) => !isStopVisit(v))
                      .length
                return (
                  <li key={visit.id}>
                    <button
                      type="button"
                      className="start-picker-item"
                      disabled={scheduling || !hasCoords}
                      onClick={() => void optimizeOrderWithOsrm(visit.id)}
                    >
                      <span className="week-order">
                        {patientNo ?? '·'}
                      </span>
                      <span className="pick-name">{label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {libraryStop ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeLibraryStopPrompt}
        >
          <div
            className="modal stop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-stop-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="library-stop-title">{libraryStop.name}</h2>
              <button
                className="btn ghost icon-action"
                type="button"
                aria-label="Kapat"
                onClick={closeLibraryStopPrompt}
              >
                <IconClose />
              </button>
            </header>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                void addStopFromLibrary()
              }}
            >
              <label>
                Bekleme (dk)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  step={1}
                  value={libraryWaitMin}
                  onChange={(e) => setLibraryWaitMin(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Hangi hastadan sonra
                <select
                  value={libraryAfterPatient}
                  onChange={(e) => setLibraryAfterPatient(e.target.value)}
                >
                  <option value="0">Listenin başına</option>
                  {patientInsertOptions.map(({ n, name }) => (
                    <option key={n} value={String(n)}>
                      {name}’dan sonra
                    </option>
                  ))}
                </select>
              </label>
              {libraryWaitError && (
                <p className="error" role="alert">
                  {libraryWaitError}
                </p>
              )}
              <footer className="modal-footer">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={closeLibraryStopPrompt}
                  disabled={busyId === libraryStop.id}
                >
                  İptal
                </button>
                <button
                  className="btn primary icon-action"
                  type="submit"
                  disabled={busyId === libraryStop.id}
                  aria-label="Ekle"
                >
                  <IconCheck />
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {pendingPatient ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closePatientInsertPrompt}
        >
          <div
            className="modal stop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-insert-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="patient-insert-title">{pendingPatient.name}</h2>
              <button
                className="btn ghost icon-action"
                type="button"
                aria-label="Kapat"
                onClick={closePatientInsertPrompt}
              >
                <IconClose />
              </button>
            </header>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                void addPatient()
              }}
            >
              <label>
                Hangi hastadan sonra
                <select
                  value={patientAfter}
                  onChange={(e) => setPatientAfter(e.target.value)}
                >
                  <option value="0">Listenin başına</option>
                  {patientInsertOptions.map(({ n, name }) => (
                    <option key={n} value={String(n)}>
                      {name}’dan sonra
                    </option>
                  ))}
                </select>
              </label>
              {patientInsertError && (
                <p className="error" role="alert">
                  {patientInsertError}
                </p>
              )}
              <footer className="modal-footer">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={closePatientInsertPrompt}
                  disabled={busyId === pendingPatient.id}
                >
                  İptal
                </button>
                <button
                  className="btn primary icon-action"
                  type="submit"
                  disabled={busyId === pendingPatient.id}
                  aria-label="Ekle"
                >
                  <IconCheck />
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {stopModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeStopModal}
        >
          <div
            className="modal stop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="stop-modal-title">
                {editingStopVisit ? 'Durağı Düzenle' : 'Durak Ekle'}
              </h2>
              <button
                className="btn ghost icon-action"
                type="button"
                aria-label="Kapat"
                onClick={closeStopModal}
              >
                <IconClose />
              </button>
            </header>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                void addStop()
              }}
            >
              <label>
                Durak adı
                <input
                  value={stopName}
                  onChange={(e) => setStopName(e.target.value)}
                  placeholder="ör. Eczane"
                  required
                  autoComplete="off"
                />
              </label>
              <CoordsField
                value={stopCoords}
                onChange={setStopCoords}
                required
              />
              <label>
                Bekleme (dk)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  step={1}
                  value={stopWaitMin}
                  onChange={(e) => setStopWaitMin(e.target.value)}
                  required
                />
              </label>
              <label>
                Hangi hastadan sonra
                <select
                  value={stopAfterPatient}
                  onChange={(e) => setStopAfterPatient(e.target.value)}
                >
                  <option value="0">Listenin başına</option>
                  {patientInsertOptions.map(({ n, name }) => (
                    <option key={n} value={String(n)}>
                      {name}’dan sonra
                    </option>
                  ))}
                </select>
              </label>
              {stopError && (
                <p className="error" role="alert">
                  {stopError}
                </p>
              )}
              <footer className="modal-footer">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={closeStopModal}
                  disabled={stopBusy}
                >
                  İptal
                </button>
                <button
                  className="btn primary icon-action"
                  type="submit"
                  disabled={stopBusy}
                  aria-label={editingStopVisit ? 'Kaydet' : 'Ekle'}
                >
                  <IconCheck />
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {confirmDialog}
    </div>
  )
}
