import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IconPlus } from '../components/Icons'
import {
  createPatient,
  deletePatient,
  subscribePatients,
  type PatientFormValues,
} from '../features/patients/api'
import { useAuth } from '../lib/auth'
import type { Patient } from '../types'

const emptyForm: PatientFormValues = {
  name: '',
  address: '',
  phone: '',
  notes: '',
  active: true,
}

export function PatientsPage() {
  const { practiceId } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [form, setForm] = useState<PatientFormValues>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, setPatients, (e) => setError(e.message))
  }, [practiceId])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!practiceId) return
    setSubmitting(true)
    setError(null)
    try {
      await createPatient(practiceId, form)
      setForm(emptyForm)
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(patient: Patient) {
    if (!practiceId) return
    if (!window.confirm(`“${patient.name}” silinsin mi?`)) return
    await deletePatient(practiceId, patient.id)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Hastalar</p>
          <h1>Liste</h1>
          <p className="muted">{patients.length} kayıt</p>
        </div>
        <button className="btn primary" type="button" onClick={() => setShowForm((v) => !v)}>
          <IconPlus /> {showForm ? 'Kapat' : 'Yeni hasta'}
        </button>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <section className="panel">
          <h2>Yeni hasta</h2>
          <form className="stack" onSubmit={(e) => void onCreate(e)}>
            <label>
              Ad soyad
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Adres
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
                placeholder="Mahalle, sokak, ilçe, il"
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
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </form>
        </section>
      )}

      <ul className="patient-list">
        {patients.map((p) => (
          <li key={p.id} className={`patient-card ${p.active ? '' : 'inactive'}`}>
            <div>
              <Link to={`/patients/${p.id}`} className="visit-name">
                {p.name}
              </Link>
              <p className="muted small">{p.address}</p>
              {p.lat == null || p.lng == null ? (
                <p className="warn small">Konum yok</p>
              ) : (
                <p className="muted small">
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </p>
              )}
            </div>
            <button className="btn danger compact" type="button" onClick={() => void onDelete(p)}>
              Sil
            </button>
          </li>
        ))}
      </ul>

      {patients.length === 0 && !showForm && (
        <section className="panel empty">
          <p>Henüz hasta yok.</p>
        </section>
      )}
    </div>
  )
}
