import { useCallback, useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type Pending = ConfirmOptions & {
  resolve: (ok: boolean) => void
}

export function useConfirm(): {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
  dialog: ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts: ConfirmOptions =
      typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok)
      return null
    })
  }, [])

  const dialog = (
    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.title}
      message={pending?.message ?? ''}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      danger={pending?.danger}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  )

  return { confirm, dialog }
}
