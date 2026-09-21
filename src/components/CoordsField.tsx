import { useState } from 'react'
import { IconMap } from './Icons'
import { MapPickerModal } from './MapPickerModal'
import { normalizeCoordsInput } from '../features/routing/coords'

type Props = {
  value: string
  onChange: (value: string) => void
  required?: boolean
}

export function CoordsField({ value, onChange, required }: Props) {
  const [mapOpen, setMapOpen] = useState(false)

  return (
    <>
      <label className="coords-field">
        Konum (enlem, boylam)
        <div className="coords-input-row">
          <input
            value={value}
            onChange={(e) => onChange(normalizeCoordsInput(e.target.value))}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              const normalized = normalizeCoordsInput(text)
              if (normalized !== text) {
                e.preventDefault()
                onChange(normalized)
              }
            }}
            required={required}
            inputMode="decimal"
            autoComplete="off"
          />
          <button
            className="btn icon-action"
            type="button"
            aria-label="Haritadan seç"
            title="Haritadan seç"
            onClick={() => setMapOpen(true)}
          >
            <IconMap />
          </button>
        </div>
        <span className="muted small coords-hint">
          Harita ikonuna bas veya Google Maps linkini yapıştır
        </span>
      </label>

      <MapPickerModal
        open={mapOpen}
        initialCoords={value}
        onClose={() => setMapOpen(false)}
        onPick={onChange}
      />
    </>
  )
}
