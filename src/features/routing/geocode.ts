import type { LatLng } from '../../types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

let lastGeocodeAt = 0

async function throttleNominatim() {
  const wait = 1100 - (Date.now() - lastGeocodeAt)
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait))
  }
  lastGeocodeAt = Date.now()
}

export async function geocodeAddress(address: string): Promise<LatLng> {
  const q = address.trim()
  if (!q) throw new Error('Adres boş')

  await throttleNominatim()

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'tr')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'tr',
    },
  })

  if (!res.ok) {
    throw new Error('Adres bulunamadı')
  }

  const data = (await res.json()) as Array<{ lat: string; lon: string }>
  if (!data.length) {
    throw new Error('Adres bulunamadı')
  }

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
  }
}
