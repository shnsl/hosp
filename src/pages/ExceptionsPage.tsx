import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconClose } from '../components/Icons'
import {
  subscribePatients,
  updatePatientAcceptWindow,
} from '../features/patients/api'
import { useAuth } from '../lib/auth'
import type { Patient } from '../types'

type Draft = { acceptFrom: string; acceptTo: string }

/** Sadece rakam; 0845 → 08:45, yazarken otomatik : */
function filterTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function draftsFromPatients(patients: Patient[]): Record<string, Draft> {
  const out: Record<string, Draft> = {}
  for (const p of patients) {
    out[p.id] = {
      acceptFrom: p.acceptFrom ?? '',
      acceptTo: p.acceptTo ?? '',
    }
  }
  return out
}

export function ExceptionsPage() {
  const { practiceId } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(
      practiceId,
      (list) => {
        const active = list.filter((p) => p.active)
        setPatients(active)
        setDrafts(draftsFromPatients(active))
      },
      (e) => setError(e.message),
    )
  }, [practiceId])

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  async function savePatient(patient: Patient) {
    if (!practiceId) return
    const d = drafts[patient.id] ?? { acceptFrom: '', acceptTo: '' }
    setBusyId(patient.id)
    setError(null)
    setMessage(null)
    try {
      const from = d.acceptFrom.trim() || null
      const to = d.acceptTo.trim() || null
      await updatePatientAcceptWindow(practiceId, patient.id, from, to)
      setMessage(`${patient.name} kaydedildi`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusyId(null)
    }
  }

  async function clearPatient(patient: Patient) {
    if (!practiceId) return
    setBusyId(patient.id)
    setError(null)
    setMessage(null)
    try {
      await updatePatientAcceptWindow(practiceId, patient.id, null, null)
      setDrafts((prev) => ({
        ...prev,
        [patient.id]: { acceptFrom: '', acceptTo: '' },
      }))
      setMessage(`${patient.name} kısıtı kaldırıldı`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Temizlenemedi')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Kurallar</p>
          <h1>İstisnalar</h1>
          <p className="muted">Hastanın tedavi kabul ettiği saat aralığı</p>
        </div>
      </header>

      <p className="muted small">
        Boş bırakılan hastalar her saatte kabul eder. Otomatik sıralama bu aralıklara uyar.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="success">{message}</p>}

      {patients.length === 0 ? (
        <section className="panel empty">
          <p className="muted">
            Önce <Link to="/patients">hasta</Link> ekle.
          </p>
        </section>
      ) : (
        <ul className="exception-list">
          {patients.map((p) => {
            const d = drafts[p.id] ?? { acceptFrom: '', acceptTo: '' }
            const hasRule = Boolean(d.acceptFrom || d.acceptTo)
            return (
              <li key={p.id} className="panel exception-card">
                <div className="exception-card-head">
                  <strong className="pick-name">{p.name}</strong>
                  {hasRule ? (
                    <span className="muted small">
                      {d.acceptFrom || '…'} – {d.acceptTo || '…'}
                    </span>
                  ) : (
                    <span className="muted small">Kısıt yok</span>
                  )}
                </div>
                <div className="exception-times">
                  <label>
                    Başlangıç (24s)
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0845"
                      maxLength={5}
                      lang="tr"
                      value={d.acceptFrom}
                      onChange={(e) =>
                        setDraft(p.id, { acceptFrom: filterTimeInput(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Bitiş (24s)
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="1200"
                      maxLength={5}
                      lang="tr"
                      value={d.acceptTo}
                      onChange={(e) =>
                        setDraft(p.id, { acceptTo: filterTimeInput(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <div className="row-actions">
                  <button
                    className="btn primary icon-action"
                    type="button"
                    aria-label="Kaydet"
                    disabled={busyId === p.id}
                    onClick={() => void savePatient(p)}
                  >
                    <IconCheck />
                  </button>
                  <button
                    className="btn icon-action"
                    type="button"
                    aria-label="Kısıtı kaldır"
                    disabled={busyId === p.id || !hasRule}
                    onClick={() => void clearPatient(p)}
                  >
                    <IconClose />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
