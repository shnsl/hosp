import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { IconFingerprint } from '../components/Icons'
import { useAuth } from '../lib/auth'
import {
  canUsePlatformBiometric,
  hasBiometricLogin,
  registerBiometricLogin,
  unlockWithBiometric,
  updateBiometricPin,
} from '../lib/biometrics'

export function LoginPage() {
  const { user, profile, loading, loginWithPin, error, clearError } = useAuth()
  const [pin, setPin] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioReady, setBioReady] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)
  const autoBioTried = useRef(false)

  useEffect(() => {
    if (loading || user) return
    const input = pinRef.current
    if (!input) return
    const id = window.setTimeout(() => {
      input.focus({ preventScroll: true })
      input.click()
    }, 50)
    return () => window.clearTimeout(id)
  }, [loading, user])

  useEffect(() => {
    let active = true
    void (async () => {
      const ok = await canUsePlatformBiometric()
      if (!active) return
      setBioAvailable(ok)
      setBioReady(ok && hasBiometricLogin())
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (loading || user || !bioReady || autoBioTried.current) return
    autoBioTried.current = true
    void onBiometricLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once when ready
  }, [loading, user, bioReady])

  // Profil (Firestore) hazır olmadan ana sayfaya geçme
  if (!loading && user && profile) {
    return <Navigate to="/" replace />
  }

  async function afterPinSuccess(usedPin: string) {
    if (!(await canUsePlatformBiometric())) return
    if (hasBiometricLogin()) {
      updateBiometricPin(usedPin)
      setBioReady(true)
      return
    }
    const ok = window.confirm(
      'Sonraki girişlerde parmak izi / yüz tanıma kullanılsın mı?',
    )
    if (!ok) return
    try {
      await registerBiometricLogin(usedPin)
      setBioReady(true)
    } catch {
      /* kullanıcı iptal */
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    clearError()
    setFormError(null)

    if (!pin) {
      setFormError('Şifre gerekli')
      return
    }

    setSubmitting(true)
    try {
      await loginWithPin(pin)
      await afterPinSuccess(pin)
      await new Promise((r) => setTimeout(r, 800))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Giriş başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  async function onBiometricLogin() {
    clearError()
    setFormError(null)
    setBioBusy(true)
    try {
      const unlockedPin = await unlockWithBiometric()
      await loginWithPin(unlockedPin)
      await new Promise((r) => setTimeout(r, 800))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biyometrik giriş başarısız'
      if (!/iptal/i.test(msg)) {
        setFormError(msg)
      }
    } finally {
      setBioBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand-icon">
          <img
            className="auth-app-icon"
            src={`${import.meta.env.BASE_URL}pwa-192.png`}
            alt=""
            width={64}
            height={64}
          />
        </div>
        <p className="eyebrow">AJAN</p>
        <h1>Giriş Yap</h1>
        <p className="muted">
          {bioReady ? 'Parmak izi veya şifre ile gir.' : 'Şifreni Gir.'}
        </p>

        {bioReady ? (
          <button
            className="btn primary auth-bio-btn"
            type="button"
            disabled={submitting || bioBusy}
            onClick={() => void onBiometricLogin()}
          >
            <IconFingerprint />
            {bioBusy ? 'Doğrulanıyor…' : 'Parmak izi ile giriş'}
          </button>
        ) : null}

        <form className="stack" onSubmit={onSubmit}>
          <label>
            Şifre
            <input
              ref={pinRef}
              className="pin-input"
              type="password"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 64)
                setPin(next)
              }}
              required
              autoFocus={!bioReady}
            />
          </label>

          {(formError || error) && (
            <p className="error" role="alert">
              {formError || error}
            </p>
          )}

          <button
            className="btn primary"
            type="submit"
            disabled={submitting || bioBusy || pin.length === 0}
          >
            {submitting ? 'Bekle…' : 'Giriş Yap'}
          </button>
        </form>

        {bioAvailable && !bioReady ? (
          <p className="muted small auth-bio-hint">
            Şifre ile girdikten sonra parmak izini kaydedebilirsin.
          </p>
        ) : null}
      </div>
    </div>
  )
}
