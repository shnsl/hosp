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
  APP_FONTS,
  DEFAULT_FONT_ID,
  getFontOption,
  isAppFontId,
  type AppFontId,
  type AppFontOption,
} from './fonts'

interface FontContextValue {
  fontId: AppFontId
  font: AppFontOption
  fonts: AppFontOption[]
  setFontId: (id: AppFontId) => void
}

const STORAGE_KEY = 'hosp-font-v2'
const STYLE_ID = 'hosp-app-fonts'
const FontContext = createContext<FontContextValue | null>(null)

function fontUrl(file: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}fonts/${file}`
}

function ensureFontFaces() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  style.textContent = APP_FONTS.filter((font) => font.file && font.format)
    .map((font) => {
      const family = font.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const url = fontUrl(font.file!).replace(/'/g, "\\'")
      return `@font-face{font-family:'${family}';src:url('${url}') format('${font.format}');font-weight:400;font-style:normal;font-display:swap;}`
    })
    .join('\n')
}

function applyFont(id: AppFontId) {
  const font = getFontOption(id)
  document.documentElement.setAttribute('data-font', id)
  document.documentElement.style.setProperty('--app-font', font.stack)
}

function readStoredFont(): AppFontId {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isAppFontId(stored)) return stored
  return DEFAULT_FONT_ID
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [fontId, setFontIdState] = useState<AppFontId>(() => {
    if (typeof window === 'undefined') return DEFAULT_FONT_ID
    ensureFontFaces()
    const initial = readStoredFont()
    applyFont(initial)
    return initial
  })

  useEffect(() => {
    ensureFontFaces()
    applyFont(fontId)
    localStorage.setItem(STORAGE_KEY, fontId)
  }, [fontId])

  const setFontId = useCallback((id: AppFontId) => {
    setFontIdState(id)
  }, [])

  const value = useMemo(
    () => ({
      fontId,
      font: getFontOption(fontId),
      fonts: APP_FONTS,
      setFontId,
    }),
    [fontId, setFontId],
  )

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>
}

export function useFont(): FontContextValue {
  const ctx = useContext(FontContext)
  if (!ctx) {
    throw new Error('useFont yalnızca FontProvider içinde kullanılabilir')
  }
  return ctx
}
