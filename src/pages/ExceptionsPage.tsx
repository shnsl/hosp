import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconClose } from '../components/Icons'
import { TimeRangeWheelPicker } from '../components/IosWheelPicker'
import { useConfirm } from '../components/useConfirm'
import {
  subscribePatients,
  updatePatientAcceptWindow,
} from '../features/patients/api'
import { subscribeAllVisits } from '../features/visits/api'
import { ACCENTS } from '../lib/accents'
import { useAuth } from '../lib/auth'
import { WEEKDAYS } from '../lib/dates'
import { useTheme } from '../lib/theme'
import type { Patient, Visit } from '../types'

type Draft = { acceptFrom: string; acceptTo: string }
type SectionId = 'list' | 'overview'
type OverviewSort = 'window' | 'name'
type TimePickerTarget = {
  patientId: string
  name: string
} | null

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

function ExceptionSection({
  id,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  id: SectionId
  title: string
  meta?: string
  open: boolean
  onToggle: (id: SectionId) => void
  children: ReactNode
}) {
  return (
    <section className="panel settings-panel exception-section">
      <button
        type="button"
        className="panel-toggle"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <h2>
          {title}
          {meta ? <span className="muted small exception-section-meta"> · {meta}</span> : null}
        </h2>
        <span className="muted small" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? <div className="settings-panel-body">{children}</div> : null}
    </section>
  )
}

function parseTimeMin(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

const TRACK_START_MIN = 8 * 60 // 08:00
const TRACK_END_MIN = 16 * 60 // 16:00
const TRACK_SPAN_MIN = TRACK_END_MIN - TRACK_START_MIN // 8 saat

/** 08:00–16:00 aralığında gün yüzdesi (0–100) */
function timeToTrackPct(hhmm: string): number | null {
  const min = parseTimeMin(hhmm)
  if (min == null) return null
  const clamped = Math.min(TRACK_END_MIN, Math.max(TRACK_START_MIN, min))
  return ((clamped - TRACK_START_MIN) / TRACK_SPAN_MIN) * 100
}

function roundBucket(min: number, step = 30): number {
  return Math.round(min / step) * step
}

/** Aynı / yakın aralıklar aynı anahtarı alır (30 dk bucket) */
function windowGroupKey(from: string, to: string): string {
  const f = parseTimeMin(from)
  const t = parseTimeMin(to)
  const fb = f == null ? -1 : roundBucket(f)
  const tb = t == null ? 24 * 60 : roundBucket(t)
  return `${fb}-${tb}`
}

function windowSortValue(from: string, to: string): number {
  const f = parseTimeMin(from) ?? -1
  const t = parseTimeMin(to) ?? 24 * 60
  return f * 10_000 + t
}

export function ExceptionsPage() {
  const { practiceId } = useAuth()
  const { theme } = useTheme()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [patients, setPatients] = useState<Patient[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [timePicker, setTimePicker] = useState<TimePickerTarget>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [overviewSort, setOverviewSort] = useState<OverviewSort>('window')

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

  useEffect(() => {
    if (!practiceId) return
    return subscribeAllVisits(practiceId, setVisits, (e) => setError(e.message))
  }, [practiceId])

  const daysByPatient = useMemo(() => {
    const map = new Map<string, string>()
    const days = new Map<string, Set<number>>()
    for (const v of visits) {
      let set = days.get(v.patientId)
      if (!set) {
        set = new Set()
        days.set(v.patientId, set)
      }
      set.add(v.weekday)
    }
    for (const [patientId, set] of days) {
      const labels = WEEKDAYS.filter((d) => set.has(d.value)).map((d) => d.short)
      if (labels.length > 0) map.set(patientId, labels.join(','))
    }
    return map
  }, [visits])

  const ruled = useMemo(() => {
    const rows = patients
      .map((p) => {
        const d = drafts[p.id] ?? { acceptFrom: '', acceptTo: '' }
        const from = d.acceptFrom.trim()
        const to = d.acceptTo.trim()
        if (!from && !to) return null
        return {
          id: p.id,
          name: p.name,
          daysLabel: daysByPatient.get(p.id) ?? '',
          from,
          to,
          fromPct: from ? timeToTrackPct(from) : 0,
          toPct: to ? timeToTrackPct(to) : 100,
          groupKey: windowGroupKey(from, to),
          sortValue: windowSortValue(from, to),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)

    const groupOrder: string[] = []
    for (const r of [...rows].sort((a, b) => a.sortValue - b.sortValue)) {
      if (!groupOrder.includes(r.groupKey)) groupOrder.push(r.groupKey)
    }
    const colorByGroup = new Map<string, string>()
    for (let i = 0; i < groupOrder.length; i++) {
      const accent = ACCENTS[i % ACCENTS.length]
      colorByGroup.set(groupOrder[i], accent.themeColor[theme])
    }

    const withColor = rows.map((r) => ({
      ...r,
      color: colorByGroup.get(r.groupKey) ?? ACCENTS[0].themeColor[theme],
    }))

    if (overviewSort === 'name') {
      return [...withColor].sort((a, b) =>
        a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }),
      )
    }
    return [...withColor].sort(
      (a, b) =>
        a.sortValue - b.sortValue ||
        a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }),
    )
  }, [patients, drafts, overviewSort, theme, daysByPatient])

  function toggleSection(id: SectionId) {
    setOpenSection((prev) => (prev === id ? null : id))
  }

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
    const ok = await confirm({
      title: 'Kısıtı kaldır',
      message: `“${patient.name}” için saat kısıtı silinsin mi?`,
      confirmLabel: 'Sil',
    })
    if (!ok) return
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
        </div>
      </header>

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
        <div className="exception-sections">
          <ExceptionSection
            id="list"
            title="Liste"
            meta={`${patients.length} hasta`}
            open={openSection === 'list'}
            onToggle={toggleSection}
          >
            <ul className="exception-list">
              {patients.map((p) => {
                const d = drafts[p.id] ?? { acceptFrom: '', acceptTo: '' }
                const hasRule = Boolean(d.acceptFrom || d.acceptTo)
                return (
                  <li key={p.id} className="exception-card">
                    <strong className="pick-name exception-card-name">{p.name}</strong>
                    <button
                      className="day-timing-picker-btn exception-time-btn"
                      type="button"
                      aria-label={`${p.name} saat aralığı`}
                      onClick={() =>
                        setTimePicker({
                          patientId: p.id,
                          name: p.name,
                        })
                      }
                    >
                      {d.acceptFrom || d.acceptTo
                        ? `${d.acceptFrom || '…'} – ${d.acceptTo || '…'}`
                        : '—'}
                    </button>
                    <div className="row-actions exception-card-actions">
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
          </ExceptionSection>

          <ExceptionSection
            id="overview"
            title="Özet"
            meta={
              ruled.length > 0
                ? `${ruled.length} kısıt`
                : 'kısıt yok'
            }
            open={openSection === 'overview'}
            onToggle={toggleSection}
          >
            {ruled.length === 0 ? (
              <p className="muted small">Henüz saat kısıtı yok.</p>
            ) : (
              <>
                <div
                  className="exception-sort"
                  role="group"
                  aria-label="Özet sıralama"
                >
                  <button
                    type="button"
                    className={`exception-sort-btn${overviewSort === 'window' ? ' is-active' : ''}`}
                    aria-pressed={overviewSort === 'window'}
                    onClick={() => setOverviewSort('window')}
                  >
                    Saate göre
                  </button>
                  <button
                    type="button"
                    className={`exception-sort-btn${overviewSort === 'name' ? ' is-active' : ''}`}
                    aria-pressed={overviewSort === 'name'}
                    onClick={() => setOverviewSort('name')}
                  >
                    İsme göre
                  </button>
                </div>
                <ul className="exception-overview">
                  {ruled.map((r) => {
                    const left = Math.min(r.fromPct ?? 0, r.toPct ?? 100)
                    const right = Math.max(r.fromPct ?? 0, r.toPct ?? 100)
                    const width = Math.max(2, right - left)
                    return (
                      <li key={r.id} className="exception-overview-item">
                        <div className="exception-overview-head">
                          <strong>
                            {r.name}
                            {r.daysLabel ? (
                              <span className="muted exception-overview-days">
                                {' '}
                                ({r.daysLabel})
                              </span>
                            ) : null}
                          </strong>
                          <span className="muted small">
                            {r.from || '…'} – {r.to || '…'}
                          </span>
                        </div>
                        <div className="exception-overview-track" aria-hidden>
                          <span
                            className="exception-overview-bar"
                            style={
                              {
                                left: `${left}%`,
                                width: `${width}%`,
                                '--bar-color': r.color,
                              } as CSSProperties
                            }
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </ExceptionSection>
        </div>
      )}

      <TimeRangeWheelPicker
        open={timePicker != null}
        fromValue={
          timePicker
            ? drafts[timePicker.patientId]?.acceptFrom || '08:45'
            : '08:45'
        }
        toValue={
          timePicker
            ? drafts[timePicker.patientId]?.acceptTo || '12:00'
            : '12:00'
        }
        title={timePicker ? timePicker.name : 'Saat aralığı'}
        onChange={(acceptFrom, acceptTo) => {
          if (!timePicker) return
          setDraft(timePicker.patientId, { acceptFrom, acceptTo })
        }}
        onClose={() => setTimePicker(null)}
      />

      {confirmDialog}
    </div>
  )
}
