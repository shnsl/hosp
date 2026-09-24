export type AccentId =
  | 'teal'
  | 'blue'
  | 'green'
  | 'coral'
  | 'amber'
  | 'slate'
  | 'rose'
  | 'indigo'

export const ACCENTS: ReadonlyArray<{
  id: AccentId
  label: string
  /** Ayarlar swatch (nötr önizleme) */
  swatch: string
  themeColor: { light: string; dark: string }
}> = [
  {
    id: 'teal',
    label: 'Deniz',
    swatch: '#0f6568',
    themeColor: { light: '#0f6568', dark: '#4eb8bb' },
  },
  {
    id: 'blue',
    label: 'Mavi',
    swatch: '#1f6fab',
    themeColor: { light: '#1f6fab', dark: '#6db4e8' },
  },
  {
    id: 'green',
    label: 'Yeşil',
    swatch: '#2f7a45',
    themeColor: { light: '#2f7a45', dark: '#6fbf84' },
  },
  {
    id: 'coral',
    label: 'Mercan',
    swatch: '#c45a3a',
    themeColor: { light: '#c45a3a', dark: '#e89076' },
  },
  {
    id: 'amber',
    label: 'Kehribar',
    swatch: '#b07a1a',
    themeColor: { light: '#b07a1a', dark: '#e0b45c' },
  },
  {
    id: 'slate',
    label: 'Arduvaz',
    swatch: '#4a5d6e',
    themeColor: { light: '#4a5d6e', dark: '#9bb0c2' },
  },
  {
    id: 'rose',
    label: 'Gül',
    swatch: '#a84868',
    themeColor: { light: '#a84868', dark: '#e09bb4' },
  },
  {
    id: 'indigo',
    label: 'Lacivert',
    swatch: '#3d4f8f',
    themeColor: { light: '#3d4f8f', dark: '#9aabdf' },
  },
]

export function isAccentId(v: string | null | undefined): v is AccentId {
  return ACCENTS.some((a) => a.id === v)
}

export function accentThemeColor(accent: AccentId, theme: 'light' | 'dark'): string {
  const row = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0]
  return row.themeColor[theme]
}
