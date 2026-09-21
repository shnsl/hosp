import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconClose, IconDown, IconPlus, IconRoute, IconUp } from '../components/Icons'
import { subscribePatients } from '../features/patients/api'
import {
  applyVisitOrderAndTimes,
  reorderVisits,
  subscribeVisitsForDate,
  updateVisit,
} from '../features/visits/api'
import { addMinutesToTime, suggestRoute } from '../features/routing/optimize'
import { legsAlongOrder, fetchDistanceMatrix } from '../features/routing/matrix'
import { useAuth } from '../lib/auth'
import { formatDateTr, todayIsoDate } from '../lib/dates'
import type { LatLng, Patient, RouteSuggestion, Visit } from '../types'

export function TodayPage() {
  const { practiceId } = useAuth()
  const date = todayIsoDate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [legs, setLegs] = useState<
    Array<{ distanceKm: number; durationMin: number; source: string }>
  >([])
  const [routeBusy, setRouteBusy] = useState(false)
  const [suggestion, setSuggestion] = useState<RouteSuggestion | null>(null)

  useEffect(() => {
    if (!practiceId) return
    const unsubP = subscribePatients(practiceId, setPatients, (e) =>
      setError(e.message),
    )
    const unsubV = subscribeVisitsForDate(practiceId, date, setVisits, (e) =>
      setError(e.message),
    )
    return () => {
      unsubP()
      unsubV()
    }
  }, [practiceId, date])

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>()
    for (const p of patients) m.set(p.id, p)
    return m
  }, [patients])

  const activeVisits = useMemo(
    () => visits.filter((v) => v.status !== 'cancelled'),
    [visits],
  )

  useEffect(() => {
    let cancelled = false
    async function loadLegs() {
      const points: LatLng[] = []
      for (const v of activeVisits) {
        const p = patientMap.get(v.patientId)
        if (!p || p.lat == null || p.lng == null) {
          if (!cancelled) setLegs([])
          return
        }
        points.push({ lat: p.lat, lng: p.lng })
      }
      if (points.length < 2) {
        if (!cancelled) setLegs([])
        return
      }
      try {
        const matrix = await fetchDistanceMatrix(points)
        const order = points.map((_, i) => i)
        const next = legsAlongOrder(order, matrix).map((l) => ({
          distanceKm: l.distanceKm,
          durationMin: l.durationMin,
          source: l.source,
        }))
        if (!cancelled) setLegs(next)
      } catch {
        if (!cancelled) setLegs([])
      }
    }
    void loadLegs()
    return () => {
      cancelled = true
    }
  }, [activeVisits, patientMap])

  async function move(index: number, dir: -1 | 1) {
    if (!practiceId) return
    const next = index + dir
    if (next < 0 || next >= activeVisits.length) return
    const ids = activeVisits.map((v) => v.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    await reorderVisits(practiceId, ids)
    setSuggestion(null)
  }

  async function markDone(visit: Visit) {
    if (!practiceId) return
    await updateVisit(practiceId, visit.id, {
      status: visit.status === 'done' ? 'planned' : 'done',
    })
  }

  async function optimize() {
    if (!practiceId || activeVisits.length < 2) return
    setRouteBusy(true)
    setError(null)
    try {
      const points: LatLng[] = []
      for (const v of activeVisits) {
        const p = patientMap.get(v.patientId)
        if (!p || p.lat == null || p.lng == null) {
          throw new Error(
            'Tüm hastalarda konum olmalı. Hasta kartından adresi güncelle.',
          )
        }
        points.push({ lat: p.lat, lng: p.lng })
      }
      const result = await suggestRoute(points)
      setSuggestion(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rota hesaplanamadı')
    } finally {
      setRouteBusy(false)
    }
  }

  async function applySuggestion() {
    if (!practiceId || !suggestion) return
    const reordered = suggestion.order.map((i) => activeVisits[i])
    let time = reordered[0]?.startTime || '09:00'
    const payload = reordered.map((v, order) => {
      const item = { id: v.id, order, startTime: time }
      const drive =
        order < suggestion.legs.length ? suggestion.legs[order].durationMin : 0
      time = addMinutesToTime(time, v.durationMin + drive)
      return item
    })
    await applyVisitOrderAndTimes(practiceId, payload)
    setSuggestion(null)
  }

  const totalDrive = legs.reduce(
    (s, l) => ({
      km: s.km + l.distanceKm,
      min: s.min + l.durationMin,
    }),
    { km: 0, min: 0 },
  )

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Bugün</p>
          <h1>{formatDateTr(date)}</h1>
          <p className="muted">
            {activeVisits.length} ziyaret
            {legs.length > 0
              ? ` · ~${totalDrive.km.toFixed(1)} km · ~${totalDrive.min} dk yol`
              : ''}
          </p>
        </div>
        <div className="row-actions">
          <Link className="btn primary icon-action" to="/agenda" aria-label="Planla">
            <IconPlus />
          </Link>
          <button
            className="btn primary icon-action"
            type="button"
            aria-label="Rota öner"
            onClick={() => void optimize()}
            disabled={routeBusy || activeVisits.length < 2}
          >
            <IconRoute />
          </button>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {suggestion && (
        <section className="panel highlight">
          <h2>Önerilen sıra</h2>
          <p className="muted">
            Toplam ~{suggestion.totalDistanceKm} km · ~{suggestion.totalDurationMin}{' '}
            dk araç yolu
          </p>
          <ol className="suggest-list">
            {suggestion.order.map((idx, i) => {
              const visit = activeVisits[idx]
              const patient = patientMap.get(visit.patientId)
              const leg = suggestion.legs[i]
              return (
                <li key={visit.id}>
                  <strong>{patient?.name ?? 'Hasta'}</strong>
                  {leg ? (
                    <span className="muted small">
                      {' '}
                      → sonraki: {leg.distanceKm} km / {leg.durationMin} dk (araç)
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ol>
          <div className="row-actions">
            <button
              className="btn primary icon-action"
              type="button"
              aria-label="Uygula"
              onClick={() => void applySuggestion()}
            >
              <IconCheck />
            </button>
            <button
              className="btn icon-action"
              type="button"
              aria-label="Vazgeç"
              onClick={() => setSuggestion(null)}
            >
              <IconClose />
            </button>
          </div>
        </section>
      )}

      {activeVisits.length === 0 ? (
        <section className="panel empty">
          <p>Bugün için ziyaret yok.</p>
          <Link className="btn primary icon-action" to="/agenda" aria-label="Ajandaya ekle">
            <IconPlus />
          </Link>
        </section>
      ) : (
        <ul className="visit-list" data-no-swipe>
          {activeVisits.map((visit, index) => {
            const patient = patientMap.get(visit.patientId)
            const legAfter = legs[index]
            return (
              <li key={visit.id} className={`visit-card ${visit.status}`}>
                <div className="visit-card-main">
                  <div className="visit-order">{index + 1}</div>
                  <div>
                    <Link to={`/patients/${visit.patientId}`} className="visit-name">
                      {patient?.name ?? 'Bilinmeyen hasta'}
                    </Link>
                    <p className="muted small">
                      {visit.startTime} · {visit.durationMin} dk
                      {patient?.address ? ` · ${patient.address}` : ''}
                    </p>
                    {patient && (patient.lat == null || patient.lng == null) && (
                      <p className="warn small">Konum yok — rota için adresi güncelle</p>
                    )}
                  </div>
                </div>
                <div className="visit-card-actions">
                  <button
                    className="icon-only"
                    type="button"
                    aria-label="Yukarı"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <IconUp />
                  </button>
                  <button
                    className="icon-only"
                    type="button"
                    aria-label="Aşağı"
                    disabled={index === activeVisits.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <IconDown />
                  </button>
                  <button
                    className={`btn icon-action ${visit.status === 'done' ? 'ghost' : 'primary'}`}
                    type="button"
                    aria-label={visit.status === 'done' ? 'Geri al' : 'Tamam'}
                    onClick={() => void markDone(visit)}
                  >
                    <IconCheck />
                  </button>
                </div>
                {legAfter && (
                  <p className="leg-hint muted small">
                    Sonraki: {legAfter.distanceKm} km · {legAfter.durationMin} dk
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
