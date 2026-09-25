export type AppFontId =
  | 'inter'
  | 'sf'
  | 'montserrat'
  | 'lato'
  | 'raleway'
  | 'rubik'
  | 'karla'
  | 'mulish'
  | 'lexend'
  | 'figtree'
  | 'dm-sans'
  | 'saira'

export interface AppFontOption {
  id: AppFontId
  label: string
  /** CSS font-family yığını (uygulamada kullanılan) */
  stack: string
  /** public/fonts altındaki dosya; sistem fontlarında yok */
  file?: string
  format?: 'opentype' | 'truetype'
  /** Önizleme için kısa örnek (Türkçe) */
  sample: string
}

/** Hepsi Latin Extended / Türkçe (ğüşıöçĞÜŞİÖÇ) destekler */
export const APP_FONTS: AppFontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    stack: '"Inter", system-ui, sans-serif',
    file: 'Inter-Regular.otf',
    format: 'opentype',
    sample: 'Çiğdem, Iğdır, Şeftali',
  },
  {
    id: 'sf',
    label: 'San Francisco',
    stack: '"San Francisco", system-ui, sans-serif',
    file: 'SF-Pro-Display-Regular.otf',
    format: 'opentype',
    sample: 'Şehir, Iğdır, Çiçek',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    stack: '"Montserrat", system-ui, sans-serif',
    file: 'Montserrat-Regular.ttf',
    format: 'truetype',
    sample: 'Gübreleme, Budama, Sürüm',
  },
  {
    id: 'lato',
    label: 'Lato',
    stack: '"Lato", system-ui, sans-serif',
    file: 'Lato-Regular.ttf',
    format: 'truetype',
    sample: 'Hasat kıyası, yevmiye',
  },
  {
    id: 'raleway',
    label: 'Raleway',
    stack: '"Raleway", system-ui, sans-serif',
    file: 'Raleway-Regular.ttf',
    format: 'truetype',
    sample: 'İşçi sayısı, elçi telefonu',
  },
  {
    id: 'rubik',
    label: 'Rubik',
    stack: '"Rubik", system-ui, sans-serif',
    file: 'Rubik-Regular.ttf',
    format: 'truetype',
    sample: 'Ağaç çeşidi, dönüm',
  },
  {
    id: 'karla',
    label: 'Karla',
    stack: '"Karla", system-ui, sans-serif',
    file: 'Karla-Regular.ttf',
    format: 'truetype',
    sample: 'Şıhlı, Öğütlü, Çınar',
  },
  {
    id: 'mulish',
    label: 'Mulish',
    stack: '"Mulish", system-ui, sans-serif',
    file: 'Mulish-Regular.ttf',
    format: 'truetype',
    sample: 'Kuzey, tarla haritası',
  },
  {
    id: 'lexend',
    label: 'Lexend',
    stack: '"Lexend", system-ui, sans-serif',
    file: 'Lexend-Regular.ttf',
    format: 'truetype',
    sample: 'Fıstık, zeytin, üzüm',
  },
  {
    id: 'figtree',
    label: 'Figtree',
    stack: '"Figtree", system-ui, sans-serif',
    file: 'Figtree-Regular.ttf',
    format: 'truetype',
    sample: 'Göl, çayır, bağ',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    stack: '"DM Sans", system-ui, sans-serif',
    file: 'DMSans-Regular.ttf',
    format: 'truetype',
    sample: 'İçde, şeker, özet',
  },
  {
    id: 'saira',
    label: 'Saira',
    stack: '"Saira", system-ui, sans-serif',
    file: 'Saira-Regular.ttf',
    format: 'truetype',
    sample: 'Çiftlik, Iğdır, Şeftali',
  },
]

export const DEFAULT_FONT_ID: AppFontId = 'sf'

export function isAppFontId(value: string | null | undefined): value is AppFontId {
  return APP_FONTS.some((f) => f.id === value)
}

export function getFontOption(id: AppFontId): AppFontOption {
  return APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0]
}
