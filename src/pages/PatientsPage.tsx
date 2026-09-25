import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CoordsField } from '../components/CoordsField'
import { IconCheck, IconClose, IconPlus, IconTrash } from '../components/Icons'
import { useConfirm } from '../components/useConfirm'
import {
  createPatient,
  deletePatient,
  subscribePatients,
  updatePatient,
  type PatientFormValues,
} from '../features/patients/api'
import { subscribeAllVisits } from '../features/visits/api'
import { useAuth } from '../lib/auth'
import type { Patient, Visit } from '../types'

const emptyForm: PatientFormValues = {
  name: '',
  coords: '',
  address: '',
  phone: '',
  notes: '',
  active: true,
}

type SortKey = 'name' | 'sessions'
type SortDir = 'asc' | 'desc'

const SORT_STORAGE_KEY = 'hosp-patient-list-sort'

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (!raw) return { key: 'name', dir: 'asc' }
    const parsed = JSON.parse(raw) as { key?: string; dir?: string }
    const key: SortKey = parsed.key === 'sessions' ? 'sessions' : 'name'
    const dir: SortDir = parsed.dir === 'desc' ? 'desc' : 'asc'
    return { key, dir }
  } catch {
    return { key: 'name', dir: 'asc' }
  }
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
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [form, setForm] = useState<PatientFormValues>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>(() => loadSort().key)
  const [sortDir, setSortDir] = useState<SortDir>(() => loadSort().dir)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, setPatients, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    return subscribeAllVisits(practiceId, setVisits, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: sortKey, dir: sortDir }))
  }, [sortKey, sortDir])

  const weeklyVisitCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of visits) {
      counts.set(v.patientId, (counts.get(v.patientId) ?? 0) + 1)
    }
    return counts
  }, [visits])

  const sortedPatients = useMemo(() => {
    const list = [...patients]
    list.sort((a, b) => {
      if (sortKey === 'sessions') {
        const ca = weeklyVisitCount.get(a.id) ?? 0
        const cb = weeklyVisitCount.get(b.id) ?? 0
        if (ca !== cb) return sortDir === 'asc' ? ca - cb : cb - ca
        return a.name.localeCompare(b.name, 'tr')
      }
      const byName = a.name.localeCompare(b.name, 'tr')
      return sortDir === 'asc' ? byName : -byName
    })
    return list
  }, [patients, weeklyVisitCount, sortKey, sortDir])

  function selectSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'sessions' ? 'desc' : 'asc')
  }

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
    const ok = await confirm({
      title: 'Hastayı sil',
      message: `“${patient.name}” silinsin mi?\nBu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
    })
    if (!ok) return
    if (editingId === patient.id) closeForm()
    await deletePatient(practiceId, patient.id)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Hastalar</p>
          <h1>Liste</h1>
          <p className="muted">
            {patients.length} kayıt · haftada {visits.length} seans
          </p>
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
          <h2>{editingId ? 'Hastayı Düzenle' : 'Yeni Hasta'}</h2>
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

      <div className="patient-sort" role="group" aria-label="Sıralama">
        <button
          type="button"
          className={`patient-sort-chip ${sortKey === 'name' ? 'is-active' : ''}`}
          onClick={() => selectSort('name')}
        >
          İsim {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          type="button"
          className={`patient-sort-chip ${sortKey === 'sessions' ? 'is-active' : ''}`}
          onClick={() => selectSort('sessions')}
        >
          Seans {sortKey === 'sessions' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
      </div>

      <ul className="patient-list">
        {sortedPatients.map((p) => {
          const weekCount = weeklyVisitCount.get(p.id) ?? 0
          const weekTone =
            weekCount === 2
              ? 'is-week-2'
              : weekCount === 3
                ? 'is-week-3'
                : 'is-week-other'
          return (
          <li
            key={p.id}
            className={`patient-card ${p.active ? '' : 'inactive'} ${editingId === p.id ? 'is-editing' : ''}`}
          >
            <button
              type="button"
              className="patient-card-main"
              onClick={() => openEdit(p)}
            >
              <span className={`visit-name plan-name ${weekTone}`}>
                {p.name}
              </span>
              <span className="muted small patient-week-count">
                {weekCount === 0 ? 'Plansız' : `${weekCount}×`}
              </span>
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
          )
        })}
      </ul>

      {patients.length === 0 && !showForm && (
        <section className="panel empty">
          <p>Henüz hasta yok.</p>
        </section>
      )}
      {confirmDialog}
    </div>
  )
}
