import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { UserProfile } from '../types'
import { auth, db } from './firebase'

export const HOSP_AUTH_EMAIL =
  import.meta.env.VITE_HOSP_AUTH_EMAIL?.trim() ||
  `owner@${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'hosp'}.firebaseapp.com`

export const DEFAULT_PIN = '222222'

export const pinSchema = {
  test(value: string): value is string {
    return /^\d{6}$/.test(value)
  },
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  practiceId: string | null
  loading: boolean
  error: string | null
  loginWithPin: (pin: string) => Promise<void>
  changePin: (currentPin: string, nextPin: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_UNLOCK_KEY = 'hosp-session-unlocked'

function markSessionUnlocked() {
  sessionStorage.setItem(SESSION_UNLOCK_KEY, '1')
}

function clearSessionUnlock() {
  sessionStorage.removeItem(SESSION_UNLOCK_KEY)
}

function isSessionUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1'
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return new Date().toISOString()
}

function authErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: string }).code)
  }
  return null
}

function friendlyFirestoreError(err: unknown): string {
  const code = authErrorCode(err)
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Firestore kuralları engelliyor. Firebase Console → Firestore → Rules içine firestore.rules dosyasını yapıştırıp Publish et, sonra tekrar giriş yap.'
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return 'Oturum yüklenemedi'
}

async function ensureUserPractice(
  user: User,
  practiceName = 'Pratiğim',
): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid)
  const existing = await getDoc(userRef)

  if (existing.exists()) {
    const data = existing.data()
    return {
      email: data.email as string,
      displayName: data.displayName as string | undefined,
      practiceId: data.practiceId as string,
      createdAt: toIso(data.createdAt),
    }
  }

  const practiceRef = doc(db, 'practices', user.uid)
  const practiceSnap = await getDoc(practiceRef)

  if (!practiceSnap.exists()) {
    await setDoc(practiceRef, {
      name: practiceName,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
    })
  }

  const profile: UserProfile = {
    email: user.email ?? HOSP_AUTH_EMAIL,
    practiceId: practiceRef.id,
    createdAt: new Date().toISOString(),
  }

  await setDoc(userRef, {
    email: profile.email,
    practiceId: profile.practiceId,
    createdAt: serverTimestamp(),
  })

  await setDoc(
    doc(db, 'practices', practiceRef.id, 'config', 'access'),
    {
      method: 'pin',
      pinLength: 6,
      defaultPinHint: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )

  return profile
}

async function markPinUpdated(practiceId: string) {
  await setDoc(
    doc(db, 'practices', practiceId, 'config', 'access'),
    {
      method: 'pin',
      pinLength: 6,
      defaultPinHint: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setLoading(true)
      try {
        if (!nextUser) {
          setUser(null)
          setProfile(null)
          return
        }

        if (!isSessionUnlocked()) {
          clearSessionUnlock()
          await signOut(auth)
          setUser(null)
          setProfile(null)
          return
        }

        setUser(nextUser)
        const nextProfile = await ensureUserPractice(nextUser)
        setProfile(nextProfile)
        setError(null)
      } catch (err) {
        console.error(err)
        setError(friendlyFirestoreError(err))
        setUser(null)
        setProfile(null)
        clearSessionUnlock()
        try {
          await signOut(auth)
        } catch {
          // ignore
        }
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  const loginWithPin = useCallback(async (pin: string) => {
    setError(null)
    if (!pinSchema.test(pin)) {
      throw new Error('Şifre 6 haneli olmalı')
    }

    markSessionUnlocked()
    try {
      await signInWithEmailAndPassword(auth, HOSP_AUTH_EMAIL, pin)
    } catch (err) {
      const code = authErrorCode(err)
      const missingOrWrong =
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password'

      // İlk kurulum: hesap yoksa girilen PIN ile oluştur
      if (missingOrWrong) {
        try {
          await createUserWithEmailAndPassword(auth, HOSP_AUTH_EMAIL, pin)
          return
        } catch (createErr) {
          const createCode = authErrorCode(createErr)
          if (createCode === 'auth/email-already-in-use') {
            clearSessionUnlock()
            throw new Error('Şifre hatalı')
          }
          clearSessionUnlock()
          throw createErr instanceof Error
            ? createErr
            : new Error('Hesap oluşturulamadı')
        }
      }

      clearSessionUnlock()
      throw err instanceof Error ? err : new Error('Giriş başarısız')
    }
  }, [])

  const changePin = useCallback(async (currentPin: string, nextPin: string) => {
    setError(null)
    if (!pinSchema.test(currentPin) || !pinSchema.test(nextPin)) {
      throw new Error('Şifreyi kontrol et')
    }
    if (currentPin === nextPin) {
      throw new Error('Yeni şifre eskisiyle aynı olamaz')
    }

    const currentUser = auth.currentUser
    if (!currentUser || !currentUser.email) {
      throw new Error('Oturum bulunamadı')
    }

    const credential = EmailAuthProvider.credential(currentUser.email, currentPin)
    await reauthenticateWithCredential(currentUser, credential)
    await updatePassword(currentUser, nextPin)

    await markPinUpdated(currentUser.uid)
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    clearSessionUnlock()
    await signOut(auth)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo(
    () => ({
      user,
      profile,
      practiceId: profile?.practiceId ?? null,
      loading,
      error,
      loginWithPin,
      changePin,
      logout,
      clearError,
    }),
    [user, profile, loading, error, loginWithPin, changePin, logout, clearError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth yalnızca AuthProvider içinde kullanılabilir')
  }
  return ctx
}
