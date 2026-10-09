import type { TokenStream } from './tokenize'

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface PlayerState {
  index: number
  playing: boolean
  wpm: number
  /** True once the last word has been shown. */
  finished: boolean
}

export interface PlayerOptions {
  wpm?: number
  index?: number
  /** Words to step back when resuming after a pause longer than `rewindAfterMs`. */
  rewindWords?: number
  rewindAfterMs?: number
  clock?: Clock
}

/** Slower first words after (re)starting so the eye can lock on. */
const RAMP = [1.6, 1.3, 1.12]
/** If we fall this far behind schedule (tab hidden, debugger…), resync instead of racing. */
const MAX_LAG_MS = 250

export const MIN_WPM = 100
export const MAX_WPM = 1000

/**
 * Drift-corrected RSVP scheduler. Each word's deadline is computed from the
 * previous deadline (not from "now"), so timer jitter does not accumulate and
 * 600 wpm stays 600 wpm over a whole chapter.
 */
export class RsvpPlayer {
  private stream: TokenStream
  private clock: Clock
  private timer: unknown = null
  private deadline = 0
  private rampStep = RAMP.length
  private pausedAt = -Infinity
  private listeners = new Set<() => void>()
  private state: PlayerState
  rewindWords: number
  rewindAfterMs: number

  constructor(stream: TokenStream, opts: PlayerOptions = {}) {
    this.stream = stream
    this.clock = opts.clock ?? realClock
    this.rewindWords = opts.rewindWords ?? 0
    this.rewindAfterMs = opts.rewindAfterMs ?? 1500
    this.state = {
      index: this.clamp(opts.index ?? 0),
      playing: false,
      wpm: clampWpm(opts.wpm ?? 300),
      finished: false,
    }
  }

  // --- external store API (React useSyncExternalStore) ---
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): PlayerState => this.state

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  private clamp(i: number) {
    return Math.max(0, Math.min(Math.round(i), Math.max(0, this.stream.words.length - 1)))
  }

  get length() {
    return this.stream.words.length
  }

  /** Duration in ms the word at `i` stays on screen at the current speed. */
  intervalFor(i: number): number {
    const base = 60000 / this.state.wpm
    const ramp = this.rampStep < RAMP.length ? RAMP[this.rampStep] : 1
    return base * (this.stream.pause[i] ?? 1) * ramp
  }

  play() {
    if (this.state.playing || this.state.finished || this.length === 0) return
    let index = this.state.index
    const pausedFor = this.clock.now() - this.pausedAt
    if (this.rewindWords > 0 && pausedFor > this.rewindAfterMs && Number.isFinite(this.pausedAt)) {
      const blockFirst = this.stream.blockStart[this.stream.block[index]]
      index = Math.max(blockFirst, index - this.rewindWords)
    }
    this.rampStep = 0
    this.deadline = this.clock.now()
    this.set({ playing: true, index, finished: false })
    this.schedule()
  }

  pause() {
    if (!this.state.playing) return
    this.clearTimer()
    this.pausedAt = this.clock.now()
    this.set({ playing: false })
  }

  toggle() {
    if (this.state.playing) this.pause()
    else this.play()
  }

  seek(i: number) {
    const index = this.clamp(i)
    this.pausedAt = -Infinity // explicit navigation never triggers the resume rewind
    this.set({ index, finished: false })
    if (this.state.playing) {
      this.clearTimer()
      this.rampStep = 0
      this.deadline = this.clock.now()
      this.schedule()
    }
  }

  step(delta: number) {
    this.seek(this.state.index + delta)
  }

  setRewindWords(n: number) {
    this.rewindWords = Math.max(0, Math.round(n))
  }

  setWpm(wpm: number) {
    this.set({ wpm: clampWpm(wpm) })
  }

  /** Replace the token stream (e.g. after toggling smart pauses), keeping the position. */
  setStream(stream: TokenStream, index = this.state.index) {
    this.clearTimer()
    this.stream = stream
    const wasPlaying = this.state.playing
    this.set({ index: this.clamp(index), playing: false })
    if (wasPlaying) this.play()
  }

  destroy() {
    this.clearTimer()
    this.listeners.clear()
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer)
    this.timer = null
  }

  private schedule() {
    this.deadline += this.intervalFor(this.state.index)
    if (this.rampStep < RAMP.length) this.rampStep++
    const delay = Math.max(0, this.deadline - this.clock.now())
    this.timer = this.clock.setTimeout(this.tick, delay)
  }

  private tick = () => {
    this.timer = null
    if (!this.state.playing) return
    const next = this.state.index + 1
    if (next >= this.length) {
      this.pausedAt = -Infinity
      this.set({ playing: false, finished: true })
      return
    }
    if (this.clock.now() - this.deadline > MAX_LAG_MS) this.deadline = this.clock.now()
    this.set({ index: next })
    this.schedule()
  }
}

export function clampWpm(wpm: number) {
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(wpm)))
}
