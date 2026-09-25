/** PWA / tam ekran durumunu CSS sınıfına yansıtır. Tarayıcıda otomatik Fullscreen API yok. */

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
  }
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export function isDisplayFullscreen(): boolean {
  if (getFullscreenElement()) return true
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/** Yüklü PWA veya gerçek fullscreen durumunu `is-immersive` ile senkronlar. */
export function setupImmersiveMode() {
  document.documentElement.classList.add('immersive-app')

  const syncClass = () => {
    const on = isDisplayFullscreen() || Boolean(getFullscreenElement())
    document.documentElement.classList.toggle('is-immersive', on)
  }

  syncClass()
  window.matchMedia('(display-mode: fullscreen)').addEventListener('change', syncClass)
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncClass)
  document.addEventListener('fullscreenchange', syncClass)
}
