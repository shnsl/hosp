/** Hasta dosya/seans hakları: 3 dosya × 30 seans; bölünce 15+15 (x.1 / x.2). */

export type FileHalf = 1 | 2

export type SessionMeta = {
  fileNo: number
  sessionNo: number
  /** null = tam 30’luk dosya; 1 = ilk 15 (x.1); 2 = ikinci 15 (x.2) */
  fileHalf: FileHalf | null
}

export type SessionAdvanceResult =
  | { ok: true; meta: SessionMeta; initialized: boolean }
  | { ok: false; reason: 'exhausted'; meta: SessionMeta }

export function isFileHalf(n: number): n is FileHalf {
  return n === 1 || n === 2
}

export function maxSessionFor(fileHalf: FileHalf | null): 15 | 30 {
  return fileHalf == null ? 30 : 15
}

export function formatFileLabel(fileNo: number, fileHalf: FileHalf | null): string {
  if (fileHalf != null) return `${fileNo}.${fileHalf}. dosya`
  return `${fileNo}. dosya`
}

export function formatSessionMetaShort(meta: {
  fileNo?: number | null
  sessionNo?: number | null
  fileHalf?: FileHalf | null
}): string | null {
  if (meta.fileNo == null || meta.sessionNo == null) return null
  const half = meta.fileHalf ?? null
  return `${formatFileLabel(meta.fileNo, half)} · ${meta.sessionNo}. seans`
}

/** Select değeri: "1" | "1.1" | "1.2" | … */
export function fileSelectValue(fileNo: number, fileHalf: FileHalf | null): string {
  if (fileHalf != null) return `${fileNo}.${fileHalf}`
  return String(fileNo)
}

export function parseFileSelect(value: string): { fileNo: number; fileHalf: FileHalf | null } | null {
  const t = value.trim()
  if (!t) return null
  const m = t.match(/^([123])(?:\.([12]))?$/)
  if (!m) return null
  const fileNo = Number(m[1])
  const fileHalf = m[2] ? (Number(m[2]) as FileHalf) : null
  return { fileNo, fileHalf }
}

export const FILE_SELECT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: '1' },
  { value: '1.1', label: '1.1' },
  { value: '1.2', label: '1.2' },
  { value: '2', label: '2' },
  { value: '2.1', label: '2.1' },
  { value: '2.2', label: '2.2' },
  { value: '3', label: '3' },
  { value: '3.1', label: '3.1' },
  { value: '3.2', label: '3.2' },
]

export function readSessionMeta(input: {
  fileNo?: number | null
  sessionNo?: number | null
  fileHalf?: FileHalf | null
}): SessionMeta | null {
  if (input.fileNo == null || input.sessionNo == null) return null
  if (input.fileNo < 1 || input.fileNo > 3) return null
  const fileHalf = input.fileHalf ?? null
  const max = maxSessionFor(fileHalf)
  if (input.sessionNo < 0 || input.sessionNo > max) return null
  return {
    fileNo: input.fileNo,
    sessionNo: input.sessionNo,
    fileHalf,
  }
}

/**
 * Günlük planda “alındı” ile bir seans hakkı kullan.
 * Bilgi yoksa 1. dosya / 1. seans.
 * Doluysa +1; tavan doluysa sonraki yarı/dosya.
 */
export function recordSessionVisit(current: SessionMeta | null): SessionAdvanceResult {
  if (!current) {
    return {
      ok: true,
      initialized: true,
      meta: { fileNo: 1, sessionNo: 1, fileHalf: null },
    }
  }

  const max = maxSessionFor(current.fileHalf)
  if (current.sessionNo < max) {
    return {
      ok: true,
      initialized: false,
      meta: {
        ...current,
        sessionNo: current.sessionNo + 1,
      },
    }
  }

  // Tavanda: sonraki dilime geç
  if (current.fileHalf === 1) {
    return {
      ok: true,
      initialized: false,
      meta: { fileNo: current.fileNo, sessionNo: 1, fileHalf: 2 },
    }
  }

  if (current.fileHalf === 2 || current.fileHalf == null) {
    if (current.fileNo >= 3) {
      return { ok: false, reason: 'exhausted', meta: current }
    }
    return {
      ok: true,
      initialized: false,
      meta: { fileNo: current.fileNo + 1, sessionNo: 1, fileHalf: null },
    }
  }

  return { ok: false, reason: 'exhausted', meta: current }
}
