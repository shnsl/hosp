import { useEffect, useState, type FormEvent } from 'react'
import { CoordsField } from '../components/CoordsField'
import { IconCheck, IconClose, IconPlus, IconTrash } from '../components/Icons'
import {
  createPatient,
  deletePatient,
  subscribePatients,
  updatePatient,
  type PatientFormValues,
} from '../features/patients/api'
import { useAuth } from '../lib/auth'
import type { Patient } from '../types'

const emptyForm: PatientFormValues = {
  name: '',
  coords: '',
  address: '',
  phone: '',
  notes: '',
  active: true,
}

function patientToForm(p: Patient): PatientFormValues {
  return {
    name: p.name,
    coords: p.lat != null && p.lng != null ? `${p.lat}, ${p.lng}` : '',
    address: p.address ?? '',
    phone: p.phone ?? '',
    notes: p.notes ?? '',
    active: p.active,
  }
}

export function PatientsPage() {
  const { practiceId } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [form, setForm] = useState<PatientFormValues>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, setPatients, (e) => setError(e.message))
  }, [practiceId])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setMessage(null)
    setError(null)
    setShowForm(true)
  }

  function openEdit(patient: Patient) {
    setEditingId(patient.id)
    setForm(patientToForm(patient))
    setMessage(null)
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setMessage(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!practiceId) {
      setError('Pratik yüklenemedi. Firestore kurallarını publish edip yeniden giriş yap.')
      return
    }
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      if (editingId) {
        await updatePatient(practiceId, editingId, form)
        setMessage('Güncellendi')
      } else {
        await createPatient(practiceId, form)
        setMessage('Eklendi')
      }
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(patient: Patient) {
    if (!practiceId) return
    if (!window.confirm(`“${patient.name}” silinsin mi?`)) return
    if (editingId === patient.id) closeForm()
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
        <button
          className="btn primary icon-action"
          type="button"
          aria-label={showForm && !editingId ? 'Kapat' : 'Yeni hasta'}
          onClick={() => (showForm && !editingId ? closeForm() : openCreate())}
        >
          {showForm && !editingId ? <IconClose /> : <IconPlus />}
        </button>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="success">{message}</p>}

      {showForm && (
        <section className="panel">
          <h2>{editingId ? 'Hastayı düzenle' : 'Yeni hasta'}</h2>
          <form className="stack" onSubmit={(e) => void onSubmit(e)}>
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
                disabled={submitting}
                aria-label={editingId ? 'Güncelle' : 'Kaydet'}
              >
                <IconCheck />
              </button>
              <button
                className="btn icon-action"
                type="button"
                aria-label="Vazgeç"
                onClick={closeForm}
              >
                <IconClose />
              </button>
            </div>
          </form>
        </section>
      )}

      <ul className="patient-list">
        {patients.map((p) => (
          <li
            key={p.id}
            className={`patient-card ${p.active ? '' : 'inactive'} ${editingId === p.id ? 'is-editing' : ''}`}
          >
            <button
              type="button"
              className="patient-card-main"
              onClick={() => openEdit(p)}
            >
              <span className="visit-name plan-name">{p.name}</span>
              {p.address ? <span className="muted small">{p.address}</span> : null}
              {p.lat == null || p.lng == null ? (
                <span className="warn small">Konum yok</span>
              ) : null}
            </button>
            <button
              className="btn danger icon-action"
              type="button"
              aria-label="Sil"
              onClick={() => void onDelete(p)}
            >
              <IconTrash />
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
