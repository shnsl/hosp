import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CoordsField } from '../components/CoordsField'
import { IconCheck, IconTrash } from '../components/Icons'
import {
  deletePatient,
  subscribePatients,
  updatePatient,
  type PatientFormValues,
} from '../features/patients/api'
import { useAuth } from '../lib/auth'
import type { Patient } from '../types'

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { practiceId } = useAuth()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [form, setForm] = useState<PatientFormValues | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, (list) => {
      const found = list.find((p) => p.id === id) ?? null
      setPatient(found)
      setLoaded(true)
      if (found) {
        setForm({
          name: found.name,
          coords:
            found.lat != null && found.lng != null
              ? `${found.lat}, ${found.lng}`
              : '',
          address: found.address ?? '',
          phone: found.phone ?? '',
          notes: found.notes ?? '',
          active: found.active,
        })
      }
    })
  }, [practiceId, id])

  if (!loaded) {
    return (
      <div className="page">
        <p className="muted">Yükleniyor…</p>
      </div>
    )
  }

  if (!form || !patient) {
    return (
      <div className="page">
        <p className="muted">Hasta bulunamadı.</p>
        <Link to="/patients">Listeye dön</Link>
      </div>
    )
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!practiceId || !id || !form) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await updatePatient(practiceId, id, form)
      setMessage('Kaydedildi')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!practiceId || !patient) return
    if (!window.confirm(`“${patient.name}” silinsin mi?`)) return
    await deletePatient(practiceId, patient.id)
    navigate('/patients')
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/patients">Hastalar</Link>
          </p>
          <h1>{patient.name}</h1>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="success">{message}</p>}

      <section className="panel">
        <form className="stack" onSubmit={(e) => void onSave(e)}>
          <label>
            Ad soyad
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <CoordsField
            value={form.coords}
            onChange={(coords) => setForm({ ...form, coords })}
            required
          />
          <label>
            Adres notu (opsiyonel)
            <textarea
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label>
            Telefon
            <input
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
            />
          </label>
          <label>
            Not
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Aktif
          </label>
          <div className="row-actions">
            <button
              className="btn primary icon-action"
              type="submit"
              disabled={busy}
              aria-label="Kaydet"
            >
              <IconCheck />
            </button>
            <button
              className="btn danger icon-action"
              type="button"
              aria-label="Sil"
              onClick={() => void onDelete()}
            >
              <IconTrash />
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
