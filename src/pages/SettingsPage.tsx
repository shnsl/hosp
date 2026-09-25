import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { IconCheck, IconFingerprint, IconLogout } from '../components/Icons'
import {
  defaultDayScheduleSettings,
  saveDayScheduleSettings,
  subscribeDayScheduleSettings,
  type DayScheduleSettings,
  type DayTiming,
} from '../features/agenda/daySettings'
import { rebuildAllSchedulesWithSettings } from '../features/agenda/schedule'
import { ACCENTS } from '../lib/accents'
import { DEFAULT_PIN, pinSchema, useAuth } from '../lib/auth'
import {
  canUsePlatformBiometric,
  clearBiometricLogin,
  hasBiometricLogin,
  registerBiometricLogin,
} from '../lib/biometrics'
import { WEEKDAYS, type Weekday } from '../lib/dates'
import { useFont } from '../lib/font'
import { useTheme } from '../lib/theme'

type SectionId = 'schedule' | 'appearance' | 'pin' | 'bio' | 'session'

/** Sadece rakam; 0845 → 08:45 */
function filterTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function SettingsSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: SectionId
  title: string
  open: boolean
  onToggle: (id: SectionId) => void
  children: ReactNode
}) {
  return (
    <section className="panel settings-panel">
      <button
        type="button"
        className="panel-toggle"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <h2>{title}</h2>
        <span className="muted small" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? <div className="settings-panel-body">{children}</div> : null}
    </section>
  )
}

export function SettingsPage() {
  const { practiceId, changePin, logout } = useAuth()
  const { theme, accent, toggleTheme, setAccent } = useTheme()
  const { fontId, fonts, setFontId } = useFont()
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dayDraft, setDayDraft] = useState<DayScheduleSettings>(defaultDayScheduleSettings)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<SectionId | null>(null)
  const [bioSupported, setBioSupported] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(false)
  const [bioPin, setBioPin] = useState('')
  const [bioBusy, setBioBusy] = useState(false)
  const [bioMessage, setBioMessage] = useState<string | null>(null)
  const [bioError, setBioError] = useState<string | null>(null)

  useEffect(() => {
    if (!practiceId) return
    return subscribeDayScheduleSettings(practiceId, setDayDraft, (e) =>
      setScheduleError(e.message),
    )
  }, [practiceId])

  useEffect(() => {
    let active = true
    void (async () => {
      const ok = await canUsePlatformBiometric()
      if (!active) return
      setBioSupported(ok)
      setBioEnabled(ok && hasBiometricLogin())
    })()
    return () => {
      active = false
    }
  }, [])

  function toggleSection(id: SectionId) {
    setOpenSection((prev) => (prev === id ? null : id))
  }

  function setDayTiming(weekday: Weekday, patch: Partial<DayTiming>) {
    setDayDraft((prev) => ({
      ...prev,
      [weekday]: { ...prev[weekday], ...patch },
    }))
  }

  async function onSaveSchedule(e: FormEvent) {
    e.preventDefault()
    if (!practiceId) return
    setScheduleBusy(true)
    setScheduleError(null)
    setScheduleMessage(null)
    try {
      await saveDayScheduleSettings(practiceId, dayDraft)
      await rebuildAllSchedulesWithSettings(practiceId, dayDraft)
      setScheduleMessage('Gün saatleri kaydedildi; planlar güncellendi')
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setScheduleBusy(false)
    }
  }

  async function onChangePin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!pinSchema.test(currentPin) || !pinSchema.test(nextPin)) {
      setError('Şifre 6 haneli olmalı')
      return
    }
    if (nextPin !== confirmPin) {
      setError('Yeni şifreler eşleşmiyor')
      return
    }
    setBusy(true)
    try {
      await changePin(currentPin, nextPin)
      setMessage('Şifre güncellendi')
      setCurrentPin('')
      setNextPin('')
      setConfirmPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setBusy(false)
    }
  }

  async function onEnableBio(e: FormEvent) {
    e.preventDefault()
    setBioError(null)
    setBioMessage(null)
    if (!pinSchema.test(bioPin)) {
      setBioError('Şifre 6 haneli olmalı')
      return
    }
    setBioBusy(true)
    try {
      await registerBiometricLogin(bioPin)
      setBioEnabled(true)
      setBioPin('')
      setBioMessage('Parmak izi girişi açıldı')
    } catch (err) {
      setBioError(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setBioBusy(false)
    }
  }

  function onDisableBio() {
    clearBiometricLogin()
    setBioEnabled(false)
    setBioMessage('Parmak izi girişi kapatıldı')
    setBioError(null)
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h1>Tercihler</h1>
        </div>
      </header>

      <SettingsSection
        id="schedule"
        title="Gün Saatleri"
        open={openSection === 'schedule'}
        onToggle={toggleSection}
      >
        <p className="muted small">
          Her gün için ilk hasta başlangıcı ve hastada kalış süresi. Rota ve bitiş
          hesapları buna göre yapılır.
        </p>
        <form className="stack" onSubmit={(e) => void onSaveSchedule(e)}>
          <ul className="day-timing-list">
            {WEEKDAYS.map((d) => {
              const t = dayDraft[d.value]
              return (
                <li key={d.value} className="day-timing-row">
                  <strong className="day-timing-label">{d.long}</strong>
                  <label className="day-timing-field">
                    Başlangıç
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0845"
                      maxLength={5}
                      value={t.startTime}
                      onChange={(e) =>
                        setDayTiming(d.value, { startTime: filterTimeInput(e.target.value) })
                      }
                    />
                  </label>
                  <label className="day-timing-field">
                    Süre (dk)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={15}
                      max={180}
                      step={5}
                      value={t.durationMin}
                      onChange={(e) =>
                        setDayTiming(d.value, {
                          durationMin: Number(e.target.value) || t.durationMin,
                        })
                      }
                    />
                  </label>
                </li>
              )
            })}
          </ul>
          {scheduleError && (
            <p className="error" role="alert">
              {scheduleError}
            </p>
          )}
          {scheduleMessage && <p className="success">{scheduleMessage}</p>}
          <button
            className="btn primary icon-action"
            type="submit"
            disabled={scheduleBusy || !practiceId}
            aria-label="Gün saatlerini kaydet"
          >
            <IconCheck />
          </button>
        </form>
      </SettingsSection>

      <SettingsSection
        id="appearance"
        title="Görünüm"
        open={openSection === 'appearance'}
        onToggle={toggleSection}
      >
        <button className="btn" type="button" onClick={toggleTheme}>
          Tema: {theme === 'dark' ? 'Koyu' : 'Açık'}
        </button>

        <p className="muted small accent-label">Yazı tipi</p>
        <p className="muted small">
          Türkçe karakterleri (ğüşıöç) destekleyen yazı tipleri. Seçim bu cihazda
          saklanır.
        </p>
        <div className="font-picker" role="radiogroup" aria-label="Yazı tipi">
          {fonts.map((font) => {
            const selected = font.id === fontId
            return (
              <button
                key={font.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`font-picker-option${selected ? ' is-selected' : ''}`}
                style={{ fontFamily: font.stack }}
                onClick={() => setFontId(font.id)}
              >
                <span className="font-picker-name">{font.label}</span>
                <span className="font-picker-sample muted small">{font.sample}</span>
              </button>
            )
          })}
        </div>

        <p className="muted small accent-label">Renk</p>
        <div className="accent-grid" role="listbox" aria-label="Renk paleti">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={accent === a.id}
              className={`accent-swatch ${accent === a.id ? 'is-active' : ''}`}
              style={{ '--swatch': a.swatch } as CSSProperties}
              title={a.label}
              aria-label={a.label}
              onClick={() => setAccent(a.id)}
            >
              <span className="accent-swatch-dot" />
              <span className="accent-swatch-name">{a.label}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        id="pin"
        title="Şifre Değiştir"
        open={openSection === 'pin'}
        onToggle={toggleSection}
      >
        <p className="muted small">İlk kurulum şifresi: {DEFAULT_PIN}</p>
        <form className="stack" onSubmit={(e) => void onChangePin(e)}>
          <label>
            Mevcut şifre
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) =>
                setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
          </label>
          <label>
            Yeni şifre
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              value={nextPin}
              onChange={(e) =>
                setNextPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
          </label>
          <label>
            Yeni şifre (tekrar)
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="success">{message}</p>}
          <button
            className="btn primary icon-action"
            type="submit"
            disabled={busy}
            aria-label="Güncelle"
          >
            <IconCheck />
          </button>
        </form>
      </SettingsSection>

      <SettingsSection
        id="bio"
        title="Parmak İzi"
        open={openSection === 'bio'}
        onToggle={toggleSection}
      >
        {!bioSupported ? (
          <p className="muted small">
            Bu cihazda veya tarayıcıda biyometrik giriş yok. HTTPS ve parmak izi /
            yüz tanıma destekli bir mobil tarayıcı gerekir.
          </p>
        ) : bioEnabled ? (
          <>
            <p className="muted small">Girişte parmak izi / yüz tanıma açık.</p>
            {bioMessage && <p className="success">{bioMessage}</p>}
            <button
              className="btn danger"
              type="button"
              onClick={onDisableBio}
            >
              Parmak izi girişini kapat
            </button>
          </>
        ) : (
          <form className="stack" onSubmit={(e) => void onEnableBio(e)}>
            <p className="muted small">
              Açmak için mevcut 6 haneli şifreni gir; cihaz biyometrisi kaydedilir.
            </p>
            <label>
              Şifre
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                value={bioPin}
                onChange={(e) =>
                  setBioPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
              />
            </label>
            {bioError && (
              <p className="error" role="alert">
                {bioError}
              </p>
            )}
            {bioMessage && <p className="success">{bioMessage}</p>}
            <button
              className="btn primary"
              type="submit"
              disabled={bioBusy || bioPin.length !== 6}
            >
              <IconFingerprint />{' '}
              {bioBusy ? 'Bekle…' : 'Parmak izini kaydet'}
            </button>
          </form>
        )}
      </SettingsSection>

      <SettingsSection
        id="session"
        title="Oturum"
        open={openSection === 'session'}
        onToggle={toggleSection}
      >
        <button
          className="btn danger icon-action"
          type="button"
          aria-label="Çıkış yap"
          onClick={() => void logout()}
        >
          <IconLogout />
        </button>
      </SettingsSection>
    </div>
  )
}
