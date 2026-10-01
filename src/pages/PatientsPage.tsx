import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { CoordsField } from '../components/CoordsField'
import { IconCheck, IconClose, IconEdit, IconPlus, IconTrash } from '../components/Icons'
import { useConfirm } from '../components/useConfirm'
import {
  createPatient,
  deletePatient,
  savePatientSessionMetaFromForm,
  subscribePatients,
  updatePatient,
  type PatientFormValues,
} from '../features/patients/api'
import {
  createStop,
  deleteStop,
  subscribeStops,
  updateStop,
  type StopFormValues,
} from '../features/stops/api'
import { subscribeAllVisits } from '../features/visits/api'
import { formatLatLng } from '../features/routing/coords'
import { useAuth } from '../lib/auth'
import {
  FILE_SELECT_OPTIONS,
  fileSelectValue,
  formatSessionMetaShort,
  maxSessionFor,
  parseFileSelect,
} from '../lib/sessionMeta'
import type { Patient, Stop, Visit } from '../types'

const emptyForm: PatientFormValues = {
  name: '',
  coords: '',
  address: '',
  phone: '',
  notes: '',
  active: true,
}

const emptyStopForm: StopFormValues = {
  name: '',
  coords: '',
  waitMin: 10,
}

type SortKey = 'name' | 'weekly' | 'sessionTotal'
type SortDir = 'asc' | 'desc'

const SORT_STORAGE_KEY = 'hosp-patient-list-sort'
const SESSION_HOLD_MS = 1000
const HOLD_MOVE_CANCEL_PX = 12

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (!raw) return { key: 'name', dir: 'asc' }
    const parsed = JSON.parse(raw) as { key?: string; dir?: string }
    let key: SortKey = 'name'
    if (parsed.key === 'weekly' || parsed.key === 'sessions') key = 'weekly'
    else if (parsed.key === 'sessionTotal') key = 'sessionTotal'
    const dir: SortDir = parsed.dir === 'desc' ? 'desc' : 'asc'
    return { key, dir }
  } catch {
    return { key: 'name', dir: 'asc' }
  }
}

/** Dosya + seans → karşılaştırılabilir toplam ilerleme (0–90) */
function sessionTotalProgress(p: Patient): number {
  if (p.fileNo == null || p.sessionNo == null) return -1
  const base = (p.fileNo - 1) * 30
  if (p.fileHalf === 2) return base + 15 + p.sessionNo
  return base + p.sessionNo
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

  const [sessionPatient, setSessionPatient] = useState<Patient | null>(null)
  const [sessionNo, setSessionNo] = useState('')
  const [fileNo, setFileNo] = useState('')
  const [sessionBusy, setSessionBusy] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const [stops, setStops] = useState<Stop[]>([])
  const [stopsOpen, setStopsOpen] = useState(false)
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [stopForm, setStopForm] = useState<StopFormValues>(emptyStopForm)
  const [stopSubmitting, setStopSubmitting] = useState(false)
  const [stopFormError, setStopFormError] = useState<string | null>(null)

  const holdTimerRef = useRef<number | null>(null)
  const holdStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressOpenedRef = useRef(false)

  useEffect(() => {
    if (!practiceId) return
    return subscribePatients(practiceId, setPatients, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    return subscribeAllVisits(practiceId, setVisits, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    if (!practiceId) return
    return subscribeStops(practiceId, setStops, (e) => setError(e.message))
  }, [practiceId])

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: sortKey, dir: sortDir }))
  }, [sortKey, sortDir])

  useEffect(() => {
    return () => {
      if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current)
    }
  }, [])

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
      if (sortKey === 'weekly') {
        const ca = weeklyVisitCount.get(a.id) ?? 0
        const cb = weeklyVisitCount.get(b.id) ?? 0
        if (ca !== cb) return sortDir === 'asc' ? ca - cb : cb - ca
        return a.name.localeCompare(b.name, 'tr')
      }
      if (sortKey === 'sessionTotal') {
        const ca = sessionTotalProgress(a)
        const cb = sessionTotalProgress(b)
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
    setSortDir(key === 'name' ? 'asc' : 'desc')
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

  function openSessionPopup(patient: Patient) {
    setSessionPatient(patient)
    setSessionNo(patient.sessionNo != null ? String(patient.sessionNo) : '')
    setFileNo(
      patient.fileNo != null
        ? fileSelectValue(patient.fileNo, patient.fileHalf ?? null)
        : '',
    )
    setSessionError(null)
  }

  function closeSessionPopup() {
    setSessionPatient(null)
    setSessionNo('')
    setFileNo('')
    setSessionError(null)
    setSessionBusy(false)
  }

  function clearHoldTimer() {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  function onCardPointerDown(e: ReactPointerEvent<HTMLButtonElement>, patient: Patient) {
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
      openEdit(patient)
    }, SESSION_HOLD_MS)
  }

  function onCardPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const start = holdStartRef.current
    if (!start || holdTimerRef.current == null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > HOLD_MOVE_CANCEL_PX * HOLD_MOVE_CANCEL_PX) {
      clearHoldTimer()
    }
  }

  function onCardPointerEnd() {
    clearHoldTimer()
    holdStartRef.current = null
  }

  function onCardClick(patient: Patient) {
    if (longPressOpenedRef.current) {
      longPressOpenedRef.current = false
      return
    }
    openSessionPopup(patient)
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
    if (sessionPatient?.id === patient.id) closeSessionPopup()
    await deletePatient(practiceId, patient.id)
  }

  async function onSaveStop(e: FormEvent) {
    e.preventDefault()
    if (!practiceId) return
    setStopSubmitting(true)
    setStopFormError(null)
    try {
      if (editingStopId) {
        await updateStop(practiceId, editingStopId, stopForm)
        setMessage('Durak güncellendi')
      } else {
        await createStop(practiceId, stopForm)
        setMessage('Durak eklendi')
      }
      setEditingStopId(null)
      setStopForm(emptyStopForm)
    } catch (err) {
      setStopFormError(err instanceof Error ? err.message : 'Durak kaydedilemedi')
    } finally {
      setStopSubmitting(false)
    }
  }

  function openEditStop(stop: Stop) {
    setStopsOpen(true)
    setEditingStopId(stop.id)
    setStopForm({
      name: stop.name,
      coords: formatLatLng(stop.lat, stop.lng),
      waitMin: stop.waitMin,
    })
    setStopFormError(null)
  }

  function cancelEditStop() {
    setEditingStopId(null)
    setStopForm(emptyStopForm)
    setStopFormError(null)
  }

  async function onDeleteStop(stop: Stop) {
    if (!practiceId) return
    const ok = await confirm({
      title: 'Durağı sil',
      message: `“${stop.name}” silinsin mi?`,
      confirmLabel: 'Sil',
    })
    if (!ok) return
    if (editingStopId === stop.id) cancelEditStop()
    await deleteStop(practiceId, stop.id)
  }

  async function onSaveSession(e: FormEvent) {
    e.preventDefault()
    if (!practiceId || !sessionPatient) return
    setSessionBusy(true)
    setSessionError(null)
    try {
      await savePatientSessionMetaFromForm(
        practiceId,
        sessionPatient.id,
        sessionNo,
        fileNo,
      )
      closeSessionPopup()
      setMessage(`${sessionPatient.name} seans bilgisi kaydedildi`)
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSessionBusy(false)
    }
  }

  const sessionMax = maxSessionFor(parseFileSelect(fileNo)?.fileHalf ?? null)

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
          className={`patient-sort-chip ${sortKey === 'weekly' ? 'is-active' : ''}`}
          onClick={() => selectSort('weekly')}
        >
          Haftada {sortKey === 'weekly' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          type="button"
          className={`patient-sort-chip ${sortKey === 'sessionTotal' ? 'is-active' : ''}`}
          onClick={() => selectSort('sessionTotal')}
        >
          Seans {sortKey === 'sessionTotal' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
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
          const metaParts = [
            formatSessionMetaShort({
              fileNo: p.fileNo,
              sessionNo: p.sessionNo,
              fileHalf: p.fileHalf,
            }),
          ].filter(Boolean)
          const sessionMax = maxSessionFor(p.fileHalf ?? null)
          const progressPct =
            p.sessionNo != null && p.fileNo != null
              ? Math.min(100, Math.max(0, (p.sessionNo / sessionMax) * 100))
              : 0
          return (
            <li
              key={p.id}
              className={`patient-card ${p.active ? '' : 'inactive'} ${editingId === p.id ? 'is-editing' : ''}`}
              data-file={p.fileNo != null ? String(p.fileNo) : undefined}
              style={{ '--session-progress': `${progressPct}%` } as CSSProperties}
            >
              <button
                type="button"
                className="patient-card-main"
                onClick={() => onCardClick(p)}
                onPointerDown={(e) => onCardPointerDown(e, p)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerEnd}
                onPointerCancel={onCardPointerEnd}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className={`visit-name plan-name ${weekTone}`}>{p.name}</span>
                {metaParts.length > 0 ? (
                  <span className="patient-week-count">
                    {metaParts.join(' · ')}
                  </span>
                ) : null}
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

      {sessionPatient ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeSessionPopup}
        >
          <div
            className="modal session-meta-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-meta-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="session-meta-title">{sessionPatient.name}</h2>
              <button
                className="btn ghost icon-action"
                type="button"
                aria-label="Kapat"
                onClick={closeSessionPopup}
              >
                <IconClose />
              </button>
            </header>
            <form className="stack" onSubmit={(e) => void onSaveSession(e)}>
              <div className="session-meta-fields">
                <label>
                  Kaçıncı Dosyası
                  <select
                    value={fileNo}
                    onChange={(e) => {
                      const next = e.target.value
                      setFileNo(next)
                      const half = parseFileSelect(next)?.fileHalf ?? null
                      const max = maxSessionFor(half)
                      if (sessionNo && Number(sessionNo) > max) {
                        setSessionNo(String(max))
                      }
                    }}
                  >
                    <option value="">—</option>
                    {FILE_SELECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kaçıncı Seansı
                  <select
                    value={sessionNo}
                    onChange={(e) => setSessionNo(e.target.value)}
                  >
                    <option value="">—</option>
                    {Array.from({ length: sessionMax + 1 }, (_, i) => i).map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {sessionError && (
                <p className="error" role="alert">
                  {sessionError}
                </p>
              )}
              <footer className="modal-footer session-meta-footer">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={closeSessionPopup}
                  disabled={sessionBusy}
                >
                  İptal
                </button>
                <button
                  className="btn primary icon-action"
                  type="submit"
                  disabled={sessionBusy}
                  aria-label="Kaydet"
                >
                  <IconCheck />
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      <section className="panel add-patient-panel stops-panel">
        <button
          type="button"
          className="add-patient-toggle"
          aria-expanded={stopsOpen}
          onClick={() => setStopsOpen((o) => !o)}
        >
          <h2>Durak Ekle</h2>
          <span className="muted small" aria-hidden>
            {stopsOpen ? '▲' : '▼'}
          </span>
        </button>
        {stopsOpen ? (
          <div className="settings-panel-body stack">
            <form className="stack" onSubmit={(e) => void onSaveStop(e)}>
              <p className="muted small">
                {editingStopId ? 'Durağı düzenle' : 'Yeni durak'}
              </p>
              <label>
                Durak adı
                <input
                  value={stopForm.name}
                  onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })}
                  placeholder="ör. Eczane"
                  required
                  autoComplete="off"
                />
              </label>
              <CoordsField
                value={stopForm.coords}
                onChange={(coords) => setStopForm({ ...stopForm, coords })}
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
                  value={stopForm.waitMin}
                  onChange={(e) =>
                    setStopForm({
                      ...stopForm,
                      waitMin: Number(e.target.value) || 1,
                    })
                  }
                  required
                />
              </label>
              {stopFormError && (
                <p className="error" role="alert">
                  {stopFormError}
                </p>
              )}
              <div className="row-actions">
                <button
                  className="btn primary icon-action"
                  type="submit"
                  disabled={stopSubmitting}
                  aria-label={editingStopId ? 'Güncelle' : 'Durak kaydet'}
                >
                  <IconCheck />
                </button>
                {editingStopId ? (
                  <button
                    className="btn ghost icon-action"
                    type="button"
                    aria-label="Vazgeç"
                    onClick={cancelEditStop}
                    disabled={stopSubmitting}
                  >
                    <IconClose />
                  </button>
                ) : null}
              </div>
            </form>

            {stops.length === 0 ? (
              <p className="muted small">Henüz kayıtlı durak yok.</p>
            ) : (
              <ul className="stop-library-list">
                {stops.map((s) => (
                  <li
                    key={s.id}
                    className={`stop-library-item${editingStopId === s.id ? ' is-editing' : ''}`}
                  >
                    <div>
                      <strong className="pick-name">{s.name}</strong>
                      <p className="muted small">
                        {s.waitMin} dk · {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button
                        className="btn icon-action"
                        type="button"
                        aria-label="Düzenle"
                        title="Düzenle"
                        onClick={() => openEditStop(s)}
                      >
                        <IconEdit />
                      </button>
                      <button
                        className="btn danger icon-action"
                        type="button"
                        aria-label="Sil"
                        onClick={() => void onDeleteStop(s)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {confirmDialog}
    </div>
  )
}
