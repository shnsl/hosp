import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  accentThemeColor,
  isAccentId,
  type AccentId,
} from './accents'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  accent: AccentId
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setAccent: (accent: AccentId) => void
}

const THEME_KEY = 'hosp-theme'
const ACCENT_KEY = 'hosp-accent'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function readStoredAccent(): AccentId {
  const stored = localStorage.getItem(ACCENT_KEY)
  if (isAccentId(stored)) return stored
  return 'teal'
}

export function applyTheme(theme: Theme, accent: AccentId) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-accent', accent)
  document.documentElement.style.colorScheme = theme
  const immersive =
    document.documentElement.classList.contains('is-immersive') ||
    Boolean(document.fullscreenElement) ||
    window.matchMedia('(display-mode: fullscreen)').matches
  const color = immersive ? '#000000' : accentThemeColor(accent, theme)
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', color)
  })
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    return readStoredTheme()
  })
  const [accent, setAccentState] = useState<AccentId>(() => {
    if (typeof window === 'undefined') return 'teal'
    return readStoredAccent()
  })

  useEffect(() => {
    applyTheme(theme, accent)
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(ACCENT_KEY, accent)
  }, [theme, accent])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(
    () => ({ theme, accent, toggleTheme, setTheme, setAccent }),
    [theme, accent, toggleTheme, setTheme, setAccent],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme yalnızca ThemeProvider içinde kullanılabilir')
  }
  return ctx
}
