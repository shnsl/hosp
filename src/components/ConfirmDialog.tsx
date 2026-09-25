import { IconCheck, IconClose } from './Icons'

type Props = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title = 'Onay',
  message,
  confirmLabel = 'Sil',
  cancelLabel = 'Vazgeç',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="confirm-dialog-title">{title}</h2>
          <button
            className="btn ghost icon-action"
            type="button"
            aria-label="Kapat"
            onClick={onCancel}
          >
            <IconClose />
          </button>
        </header>
        <p className="confirm-modal-message">{message}</p>
        <footer className="modal-footer">
          <button className="btn ghost" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'} icon-action`}
            type="button"
            aria-label={confirmLabel}
            onClick={onConfirm}
          >
            <IconCheck />
          </button>
        </footer>
      </div>
    </div>
  )
}
