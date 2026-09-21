import type { LatLng } from '../../types'

const DEFAULT_CENTER: LatLng = { lat: 37.066, lng: 37.383 }

/** Google Maps / OSM / düz "lat, lng" metninden konum çıkarır */
export function parseLatLngText(input: string): LatLng {
  const raw = input.trim()
  if (!raw) {
    throw new Error('Konum gerekli (enlem, boylam)')
  }

  const fromUrl = extractLatLngFromMapsText(raw)
  if (fromUrl) return fromUrl

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length !== 2) {
    throw new Error('Format: 37.092154, 37.400484 veya Google Maps linki')
  }

  return validateLatLng(Number(parts[0].replace(/\s/g, '')), Number(parts[1].replace(/\s/g, '')))
}

/** Yapıştırılan Maps URL / @lat,lng metninden dener; yoksa null */
export function extractLatLngFromMapsText(raw: string): LatLng | null {
  const text = raw.trim()

  // https://www.google.com/maps/@37.09,37.40,17z  veya /place/.../@37.09,37.40,17z
  const atMatch = text.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/)
  if (atMatch) {
    try {
      return validateLatLng(Number(atMatch[1]), Number(atMatch[2]))
    } catch {
      /* continue */
    }
  }

  // !3dLAT!4dLNG
  const dMatch = text.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/)
  if (dMatch) {
    try {
      return validateLatLng(Number(dMatch[1]), Number(dMatch[2]))
    } catch {
      /* continue */
    }
  }

  // ?q=37.09,37.40  veya &ll=37.09,37.40
  const qMatch = text.match(/[?&](?:q|ll|query)=(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/i)
  if (qMatch) {
    try {
      return validateLatLng(Number(qMatch[1]), Number(qMatch[2]))
    } catch {
      /* continue */
    }
  }

  // openstreetmap.org/?mlat=..&mlon=..
  const osmMatch = text.match(/[?&]mlat=(-?\d+\.?\d*).*?[?&]mlon=(-?\d+\.?\d*)/i)
  if (osmMatch) {
    try {
      return validateLatLng(Number(osmMatch[1]), Number(osmMatch[2]))
    } catch {
      /* continue */
    }
  }

  return null
}

/** Input değişiminde Maps linkini otomatik enlem,boylam’a çevirir */
export function normalizeCoordsInput(input: string): string {
  const fromUrl = extractLatLngFromMapsText(input)
  if (fromUrl) return formatLatLng(fromUrl.lat, fromUrl.lng)
  return input
}

export function tryParseLatLng(input: string): LatLng | null {
  try {
    return parseLatLngText(input)
  } catch {
    return null
  }
}

export function formatLatLng(lat: number, lng: number, digits = 8): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`
}

export function defaultMapCenter(existing?: string | null): LatLng {
  if (existing) {
    const parsed = tryParseLatLng(existing)
    if (parsed) return parsed
  }
  return DEFAULT_CENTER
}

function validateLatLng(lat: number, lng: number): LatLng {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Geçersiz sayı. Örnek: 37.092154, 37.400484')
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Enlem/boylam aralık dışı')
  }
  return { lat, lng }
}
