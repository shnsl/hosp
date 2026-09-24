import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { IconCheck, IconClose } from './Icons'
import { defaultMapCenter, formatLatLng, tryParseLatLng } from '../features/routing/coords'
import type { LatLng } from '../types'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

type Props = {
  open: boolean
  initialCoords?: string
  onClose: () => void
  onPick: (coordsText: string) => void
}

export function MapPickerModal({ open, initialCoords, onClose, onPick }: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [picked, setPicked] = useState<LatLng | null>(() => tryParseLatLng(initialCoords ?? ''))

  useEffect(() => {
    if (!open) return
    setPicked(tryParseLatLng(initialCoords ?? ''))
  }, [open, initialCoords])

  useEffect(() => {
    if (!open || !mapEl.current) return

    const center = defaultMapCenter(initialCoords)
    const map = L.map(mapEl.current, {
      center: [center.lat, center.lng],
      zoom: 16,
      zoomControl: true,
    })

    // Uydu
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      },
    ).addTo(map)

    // Yer isimleri
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Labels &copy; Esri',
        maxZoom: 19,
        pane: 'overlayPane',
      },
    ).addTo(map)

    // Yol isimleri
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        pane: 'overlayPane',
      },
    ).addTo(map)

    const initial = tryParseLatLng(initialCoords ?? '')
    if (initial) {
      markerRef.current = L.marker([initial.lat, initial.lng]).addTo(map)
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const next = { lat: e.latlng.lat, lng: e.latlng.lng }
      setPicked(next)
      if (markerRef.current) {
        markerRef.current.setLatLng([next.lat, next.lng])
      } else {
        markerRef.current = L.marker([next.lat, next.lng]).addTo(map)
      }
    })

    mapRef.current = map
    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [open, initialCoords])

  if (!open) return null

  const preview = picked ? formatLatLng(picked.lat, picked.lng) : null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal map-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Haritadan konum seç"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Konum</p>
            <h2>Haritadan Seç</h2>
            <p className="muted small">Haritaya dokun → pin düşer → onayla</p>
          </div>
          <button className="btn icon-action" type="button" aria-label="Kapat" onClick={onClose}>
            <IconClose />
          </button>
        </header>

        <div ref={mapEl} className="map-picker-canvas" />

        <footer className="modal-footer">
          <code className="coords-preview">{preview ?? 'Henüz seçilmedi'}</code>
          <div className="row-actions">
            <button className="btn icon-action" type="button" aria-label="Vazgeç" onClick={onClose}>
              <IconClose />
            </button>
            <button
              className="btn primary icon-action"
              type="button"
              aria-label="Konumu kullan"
              disabled={!picked}
              onClick={() => {
                if (!picked) return
                onPick(formatLatLng(picked.lat, picked.lng))
                onClose()
              }}
            >
              <IconCheck />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
