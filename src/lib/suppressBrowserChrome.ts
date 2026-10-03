/** Form alanlarında metin seçimine izin ver */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select, [contenteditable=""], [contenteditable="true"]',
    ),
  )
}

/**
 * Mobil Chrome / Safari uzun basış menülerini (bağlantıyı indir, yeni sekme vb.) engeller.
 * Yazı girilen alanlarda seçim serbest kalır.
 */
export function setupSuppressBrowserChrome() {
  document.addEventListener(
    'contextmenu',
    (e) => {
      e.preventDefault()
    },
    { capture: true },
  )

  document.addEventListener(
    'selectstart',
    (e) => {
      if (isEditableTarget(e.target)) return
      e.preventDefault()
    },
    { capture: true },
  )

  document.addEventListener(
    'dragstart',
    (e) => {
      if (isEditableTarget(e.target)) return
      e.preventDefault()
    },
    { capture: true },
  )
}
