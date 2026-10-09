import { Capacitor } from '@capacitor/core'
import { create } from 'zustand'

/** Cache where the service worker leaves EPUBs shared from other apps (see sw.ts). */
const SHARE_CACHE = 'spubber-share'

const inIframe = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** The installable web app (GitHub Pages build), not the native shells or the preview iframe. */
export const isWebApp = __PWA__ && !Capacitor.isNativePlatform() && !isTauri && !inIframe

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function iosMajorVersion(): number {
  const m = /OS (\d+)_/.exec(navigator.userAgent)
  return m ? Number(m[1]) : 0
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/* ---------------- install prompt ---------------- */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'spubber.installDismissed'
function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

interface InstallState {
  /** Chromium (Android, desktop): the deferred native install prompt. */
  prompt: BeforeInstallPromptEvent | null
  installed: boolean
  dismissed: boolean
  dismiss: () => void
  install: () => Promise<void>
}

export const useInstall = create<InstallState>()((set, get) => ({
  prompt: null,
  installed: false,
  dismissed: readDismissed(),
  dismiss: () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    set({ dismissed: true })
  },
  install: async () => {
    const p = get().prompt
    if (!p) return
    await p.prompt()
    const { outcome } = await p.userChoice
    set({ prompt: null, installed: outcome === 'accepted' })
  },
}))

/** What the install banner should show, if anything. */
export function installBannerKind(state: Pick<InstallState, 'prompt' | 'installed' | 'dismissed'>): 'ios' | 'prompt' | null {
  if (!isWebApp || state.dismissed || state.installed || isStandalone()) return null
  if (isIOS()) return 'ios'
  if (state.prompt) return 'prompt'
  return null
}

/* ---------------- service worker + storage ---------------- */

export async function initWebApp(opts: { onNeedRefresh: (update: () => void) => void; onOfflineReady: () => void }) {
  if (!isWebApp) return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useInstall.setState({ prompt: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, prompt: null }))

  // Ask the browser not to evict the library when the device is low on space.
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* ignore */
  }

  if ('serviceWorker' in navigator) {
    const { registerSW } = await import('virtual:pwa-register')
    const updateSW = registerSW({
      onNeedRefresh: () => opts.onNeedRefresh(() => void updateSW(true)),
      onOfflineReady: opts.onOfflineReady,
    })
  }
}

/** EPUBs shared to the app from the Android share sheet, removed once read. */
export async function takeSharedFiles(): Promise<{ blob: Blob; name: string }[]> {
  if (!isWebApp || !('caches' in window)) return []
  const out: { blob: Blob; name: string }[] = []
  try {
    const cache = await caches.open(SHARE_CACHE)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (res) {
        const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'libro.epub')
        out.push({ blob: await res.blob(), name })
      }
      await cache.delete(req)
    }
  } catch {
    /* ignore */
  }
  return out
}
