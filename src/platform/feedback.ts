import { Capacitor } from '@capacitor/core'

/* ------------------------------------------------------------------ *
 * Haptics: one "selection tick" per word, the same feedback iOS uses  *
 * for picker wheels. Native on Android/iOS, navigator.vibrate on the  *
 * Android web as a fallback.                                          *
 * ------------------------------------------------------------------ */

type HapticsApi = typeof import('@capacitor/haptics').Haptics
let haptics: HapticsApi | null = null
let hapticsLoading: Promise<void> | null = null

const isNative = Capacitor.isNativePlatform()

/** iPhone/iPad web: no Vibration API. Since iOS 18, toggling a native `<input switch>` gives a haptic tick. */
const iosWeb = (() => {
  if (isNative || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const major = Number(/OS (\d+)_/.exec(ua)?.[1] ?? 0)
  return ios && major >= 18
})()
let iosSwitch: HTMLLabelElement | null = null
function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    iosSwitch = label
  }
  iosSwitch.click()
}

/** True when the haptic option only works through the iOS web workaround. */
export const hapticsExperimental = iosWeb

export function hapticsSupported(): boolean {
  if (isNative || iosWeb) return true
  try {
    return 'vibrate' in navigator && window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

function loadHaptics() {
  if (!isNative || haptics || hapticsLoading) return hapticsLoading
  hapticsLoading = import('@capacitor/haptics').then((m) => {
    haptics = m.Haptics
  })
  return hapticsLoading
}

export const haptic = {
  start() {
    if (!isNative) return
    if (haptics) void haptics.selectionStart().catch(() => {})
    else void loadHaptics()?.then(() => haptics?.selectionStart().catch(() => {}))
  },
  tick() {
    if (isNative) {
      void haptics?.selectionChanged().catch(() => {})
    } else if (iosWeb) {
      iosTick()
    } else {
      try {
        navigator.vibrate?.(4)
      } catch {
        /* ignore */
      }
    }
  },
  end() {
    if (isNative) void haptics?.selectionEnd().catch(() => {})
  },
}

/* ------------------------------------------------------------------ *
 * Sound: a soft paper flick per word and a fuller page-turn swish     *
 * when the paragraph changes. Synthesised with Web Audio, so there    *
 * are no audio files and nothing to download.                         *
 * ------------------------------------------------------------------ */

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let lastFlick = 0

function audio(): AudioContext | null {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC({ latencyHint: 'interactive' })
    const len = Math.floor(ctx.sampleRate * 0.4)
    noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noise.getChannelData(0)
    // Pink-ish noise sounds more like paper than white noise.
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
    }
  } catch {
    ctx = null
  }
  return ctx
}

/** Browsers only allow audio after a user gesture: call from pointer/key handlers. */
export function unlockAudio() {
  const c = audio()
  if (c && c.state !== 'running') void c.resume().catch(() => {})
}

function burst(opts: { duration: number; gain: number; freqFrom: number; freqTo: number; q: number; attack: number }) {
  const c = audio()
  if (!c || !noise || c.state !== 'running') return
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.9 + Math.random() * 0.2
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = opts.q
  band.frequency.setValueAtTime(opts.freqFrom, t)
  band.frequency.exponentialRampToValueAtTime(opts.freqTo, t + opts.duration)
  const high = c.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 350
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain, t + opts.attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration)
  src.connect(band).connect(high).connect(g).connect(c.destination)
  src.start(t, Math.random() * 0.15, opts.duration + 0.02)
  src.stop(t + opts.duration + 0.05)
}

export const sound = {
  /** Very light paper flick for each word. */
  flick() {
    const now = performance.now()
    if (now - lastFlick < 35) return // above ~1700 wpm the ticks would blur into noise
    lastFlick = now
    const f = 2600 + Math.random() * 900
    burst({ duration: 0.032, gain: 0.05, freqFrom: f, freqTo: f * 0.8, q: 0.9, attack: 0.002 })
  },
  /** Softer, longer page-turn swish when a new paragraph starts. */
  page() {
    burst({ duration: 0.24, gain: 0.07, freqFrom: 2200, freqTo: 700, q: 0.7, attack: 0.03 })
  },
}
