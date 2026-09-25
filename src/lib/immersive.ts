/** Mobilde bildirim / tarayıcı çubuğunu mümkün olduğunca gizle. */

type FullscreenOptionsWithNav = FullscreenOptions & {
  navigationUI?: 'auto' | 'hide' | 'show'
}

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
  }
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

async function requestFs(el: Element): Promise<boolean> {
  const node = el as Element & {
    requestFullscreen?: (options?: FullscreenOptionsWithNav) => Promise<void>
    webkitRequestFullscreen?: () => void
  }

  try {
    if (typeof node.requestFullscreen === 'function') {
      await node.requestFullscreen({ navigationUI: 'hide' })
      return true
    }
    if (typeof node.webkitRequestFullscreen === 'function') {
      node.webkitRequestFullscreen()
      return true
    }
  } catch {
    return false
  }
  return false
}

export function isDisplayFullscreen(): boolean {
  if (getFullscreenElement()) return true
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/** Kullanıcı etkileşimiyle tarayıcı tam ekranına geç (bildirim çubuğunu saklar). */
export async function enterImmersive(): Promise<boolean> {
  if (getFullscreenElement()) return true
  const root = document.documentElement
  if (await requestFs(root)) return true
  if (document.body && (await requestFs(document.body))) return true
  return false
}

/**
 * İlk dokunuşta / tıklamada tam ekran dene; geri gelince tekrar dene.
 * PWA manifest `display: fullscreen` yüklü uygulamada da destekler.
 */
export function setupImmersiveMode() {
  document.documentElement.classList.add('immersive-app')

  const tryEnter = () => {
    void enterImmersive()
  }

  // İlk etkileşimde (Chrome jest gerektirir)
  const onFirstGesture = () => {
    tryEnter()
    window.removeEventListener('pointerdown', onFirstGesture, true)
    window.removeEventListener('touchstart', onFirstGesture, true)
    window.removeEventListener('click', onFirstGesture, true)
  }

  window.addEventListener('pointerdown', onFirstGesture, true)
  window.addEventListener('touchstart', onFirstGesture, true)
  window.addEventListener('click', onFirstGesture, true)

  document.addEventListener('fullscreenchange', () => {
    if (!getFullscreenElement()) {
      // Kullanıcı çıktıysa sonraki jestte tekrar dene
      window.addEventListener('pointerdown', onFirstGesture, true)
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryEnter()
  })

  // Yüklü PWA fullscreen ise sınıf ekle
  const syncClass = () => {
    const on =
      isDisplayFullscreen() || Boolean(getFullscreenElement())
    document.documentElement.classList.toggle('is-immersive', on)
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      if (on) meta.setAttribute('content', '#000000')
    })
  }
  syncClass()
  window.matchMedia('(display-mode: fullscreen)').addEventListener('change', syncClass)
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncClass)
  document.addEventListener('fullscreenchange', syncClass)
}
