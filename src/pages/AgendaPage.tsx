import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IconPlus } from '../components/Icons'
import { subscribePatients } from '../features/patients/api'
import {
  createVisit,
  deleteVisit,
  subscribeVisitsForDate,
} from '../features/visits/api'
import { useAuth } from '../lib/auth'
import { addDaysIso, formatDateTr, todayIsoDate } from '../lib/dates'
import type { Patient, Visit } from '../types'

// confirmDelete is in dates? No I put it in dates incorrectly - let me check
// I wrote confirmDelete in dates.ts - wait, I wrote it in dates.ts as confirmDelete. Let me check dates.ts

export function AgendaPage() {
  const { practiceId } = useAuth()
  const [date, setDate] = useState(todayIsoDate())
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [durationMin, setDurationMin] = useState(45)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, (list) => {
      setPatients(list.filter((p) => p.active))
    })
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
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
    () => [...visits].sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime)),
    [visits],
  )

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!practiceId || !patientId) return
    setSubmitting(true)
    setError(null)
    try {
      const order = sorted.length
      await createVisit(
        practiceId,
        {
          patientId,
          date,
          startTime,
          durationMin,
          status: 'planned',
        },
        order,
      )
      setPatientId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(visit: Visit) {
    if (!practiceId) return
    const name = patientMap.get(visit.patientId)?.name ?? 'Ziyaret'
    if (!window.confirm(`“${name}” ziyareti silinsin mi?`)) return
    await deleteVisit(practiceId, visit.id)
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
        <button className="btn" type="button" onClick={() => setDate(addDaysIso(date, -1))}>
          Önceki
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Tarih"
        />
        <button className="btn" type="button" onClick={() => setDate(addDaysIso(date, 1))}>
          Sonraki
        </button>
        <button className="btn ghost" type="button" onClick={() => setDate(todayIsoDate())}>
          Bugün
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2 className="section-title-with-icon">
          <IconPlus /> Ziyaret ekle
        </h2>
        {patients.length === 0 ? (
          <p className="muted">
            Önce <Link to="/patients">hasta ekle</Link>.
          </p>
        ) : (
          <form className="stack" onSubmit={(e) => void onAdd(e)}>
            <label>
              Hasta
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
              >
                <option value="">Seç…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid-2">
              <label>
                Saat
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </label>
              <label>
                Süre (dk)
                <input
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  required
                />
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor…' : 'Ekle'}
            </button>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Günün sırası</h2>
        {sorted.length === 0 ? (
          <p className="muted">Bu güne ziyaret yok.</p>
        ) : (
          <ul className="simple-list">
            {sorted.map((v, i) => (
              <li key={v.id}>
                <div>
                  <strong>
                    {i + 1}. {patientMap.get(v.patientId)?.name ?? 'Hasta'}
                  </strong>
                  <p className="muted small">
                    {v.startTime} · {v.durationMin} dk · {v.status}
                  </p>
                </div>
                <button className="btn danger compact" type="button" onClick={() => void onDelete(v)}>
                  Sil
                </button>
              </li>
            ))}
          </ul>
        )}
        {date === todayIsoDate() && sorted.length > 0 && (
          <p className="muted small">
            Sırayı ve rotayı <Link to="/">Bugün</Link> ekranından yönetebilirsin.
          </p>
        )}
      </section>
    </div>
  )
}
