import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { subscribePatients } from '../features/patients/api'
import { subscribeAllVisits } from '../features/visits/api'
import { useAuth } from '../lib/auth'
import { WEEKDAYS } from '../lib/dates'
import type { Patient, Visit, Weekday } from '../types'

function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function SearchPage() {
  const { practiceId } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, setPatients, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    return subscribeAllVisits(practiceId, setVisits, (e) => setError(e.message))
  }, [practiceId])

  const weeklyByPatient = useMemo(() => {
    const map = new Map<string, { count: number; days: Weekday[] }>()
    for (const v of visits) {
      if (v.status === 'cancelled') continue
      const cur = map.get(v.patientId) ?? { count: 0, days: [] }
      cur.count += 1
      if (!cur.days.includes(v.weekday)) cur.days.push(v.weekday)
      map.set(v.patientId, cur)
    }
    for (const cur of map.values()) {
      cur.days.sort((a, b) => a - b)
    }
    return map
  }, [visits])

  const results = useMemo(() => {
    const q = normalizeTr(query.trim())
    if (!q) return []
    return patients
      .filter((p) => normalizeTr(p.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [patients, query])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Hastalar</p>
          <h1>Ara</h1>
          <p className="muted">İsme göre anında bul</p>
        </div>
      </header>

      <label className="search-field">
        Hasta adı
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Yazmaya başla…"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!query.trim() ? (
        <p className="muted">Sonuçlar yazdıkça burada görünür.</p>
      ) : results.length === 0 ? (
        <p className="muted">Eşleşen hasta yok.</p>
      ) : (
        <ul className="search-result-list">
          {results.map((p) => {
            const week = weeklyByPatient.get(p.id)
            const dayLabels =
              week?.days
                .map((d) => WEEKDAYS.find((w) => w.value === d)?.short)
                .filter(Boolean)
                .join(', ') ?? ''
            const hasAccept = Boolean(p.acceptFrom || p.acceptTo)
            return (
              <li key={p.id} className={`panel search-card ${p.active ? '' : 'inactive'}`}>
                <div className="search-card-head">
                  <strong className="pick-name">{p.name}</strong>
                  {!p.active ? <span className="warn small">Pasif</span> : null}
                </div>

                {p.address ? <p className="muted small">{p.address}</p> : null}
                {p.phone ? <p className="muted small">{p.phone}</p> : null}

                <p className="muted small">
                  {week && week.count > 0
                    ? `Haftada ${week.count} kez${dayLabels ? ` (${dayLabels})` : ''}`
                    : 'Haftada plan yok'}
                </p>

                <p className={`small ${hasAccept ? '' : 'muted'}`}>
                  {hasAccept
                    ? `İstisna: ${p.acceptFrom || '…'} – ${p.acceptTo || '…'}`
                    : 'İstisna: kısıt yok'}
                </p>

                {p.notes ? <p className="muted small">Not: {p.notes}</p> : null}
                {p.lat == null || p.lng == null ? (
                  <p className="warn small">Konum yok</p>
                ) : (
                  <p className="muted small">
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </p>
                )}

                <div className="row-actions">
                  <Link className="btn ghost compact" to={`/patients/${p.id}`}>
                    Detay
                  </Link>
                  <Link className="btn ghost compact" to="/exceptions">
                    İstisnalar
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
