import { useState, type FormEvent } from 'react'
import { IconCheck, IconLogout } from '../components/Icons'
import { DEFAULT_PIN, pinSchema, useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

export function SettingsPage() {
  const { changePin, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h1>Tercihler</h1>
        </div>
      </header>

      <section className="panel">
        <h2>Görünüm</h2>
        <button className="btn" type="button" onClick={toggleTheme}>
          Tema: {theme === 'dark' ? 'Koyu' : 'Açık'}
        </button>
      </section>

      <section className="panel">
        <h2>Şifre Değiştir</h2>
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
      </section>

      <section className="panel">
        <h2>Oturum</h2>
        <button
          className="btn danger icon-action"
          type="button"
          aria-label="Çıkış yap"
          onClick={() => void logout()}
        >
          <IconLogout />
        </button>
      </section>
    </div>
  )
}
