import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { RsvpPlayer } from '../../core/rsvp/player'
import { nextSentence, prevSentence, type TokenStream } from '../../core/rsvp/tokenize'
import type { ReadMode } from '../../state/settings'

/** Pixels of drag / wheel travel per word in scroll mode. */
export const SCROLL_PX_PER_WORD = { drag: 18, wheel: 40 }
/** Delay before a press in gesture mode starts reading (lets flicks through). */
export const GESTURE_HOLD_DELAY_MS = 140

/**
 * Horizontal finger position → speed multiplier, centred on the chosen speed.
 * Centre ±10 % keeps the base speed; the edges reach ×0.5 (left) and ×2 (right).
 * The curve is flatter near the centre so small movements change speed gently.
 */
export function rateFromPosition(x: number, left: number, width: number): number {
  if (width <= 0) return 1
  const u = Math.max(-1, Math.min(1, (x - (left + width / 2)) / (width / 2)))
  const dz = 0.1
  const v = Math.max(0, Math.abs(u) - dz) / (1 - dz)
  const curved = Math.sign(u) * Math.pow(v, 1.4)
  return Math.pow(2, curved)
}

type Handlers = {
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onPointerCancel?: (e: React.PointerEvent) => void
  onLostPointerCapture?: (e: React.PointerEvent) => void
  onClick?: (e: React.MouseEvent) => void
}

/**
 * Pointer / wheel handling for the four ways of driving the reader:
 * hold (press to read), tap (toggle), scroll (drag or wheel moves word by word)
 * and gesture (hold to read; horizontal position sets speed; vertical flick jumps a sentence).
 */
export function useReaderInput(player: RsvpPlayer, stream: TokenStream, mode: ReadMode, stageRef: RefObject<HTMLElement | null>) {
  /** True while the user is actively scrubbing (scroll mode). */
  const [scrubbing, setScrubbing] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressUntil = useRef(0)

  const markActive = useCallback(() => {
    setScrubbing(true)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setScrubbing(false), 700)
  }, [])

  /** Clicks right after a drag, hold or flick must not seek in the context view. */
  const shouldSuppressClick = useCallback(() => performance.now() < suppressUntil.current, [])
  const suppress = () => {
    suppressUntil.current = performance.now() + 150
  }

  // ---------------- scroll mode ----------------
  const acc = useRef(0)
  const drag = useRef<{ y: number; t: number; v: number; moved: number } | null>(null)
  const momentum = useRef<number | null>(null)

  const consume = useCallback(
    (px: number, perWord: number) => {
      acc.current += px
      let steps = 0
      while (Math.abs(acc.current) >= perWord && Math.abs(steps) < 25) {
        const dir = Math.sign(acc.current)
        acc.current -= dir * perWord
        steps += dir
      }
      if (steps !== 0) {
        if (player.getState().playing) player.pause()
        // One word at a time so feedback (haptics, sound) fires for each.
        for (let i = 0; i < Math.abs(steps); i++) player.step(Math.sign(steps))
        markActive()
      }
    },
    [player, markActive],
  )

  const stopMomentum = () => {
    if (momentum.current !== null) cancelAnimationFrame(momentum.current)
    momentum.current = null
  }

  useEffect(() => {
    const el = stageRef.current
    if (!el || mode !== 'scroll') return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopMomentum()
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1
      consume(e.deltaY * unit, SCROLL_PX_PER_WORD.wheel)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [mode, stageRef, consume])

  // ---------------- gesture mode ----------------
  const press = useRef<{ x0: number; y0: number; t0: number; x: number; y: number; holding: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null)

  const applyRate = useCallback(
    (x: number) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (rect) player.setRate(rateFromPosition(x, rect.left, rect.width))
    },
    [player, stageRef],
  )

  const endPress = useCallback(
    (allowFlick: boolean) => {
      const p = press.current
      press.current = null
      if (!p) return
      if (p.timer) clearTimeout(p.timer)
      if (p.holding) {
        player.pause()
        player.setRate(1)
        suppress()
        return
      }
      const dx = p.x - p.x0
      const dy = p.y - p.y0
      const dt = performance.now() - p.t0
      if (allowFlick && Math.abs(dy) > 36 && Math.abs(dy) > 1.3 * Math.abs(dx) && dt < 450) {
        const i = player.getState().index
        player.seek(dy < 0 ? nextSentence(stream, i) : prevSentence(stream, i))
        suppress()
      }
    },
    [player, stream],
  )

  useEffect(
    () => () => {
      stopMomentum()
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (press.current?.timer) clearTimeout(press.current.timer)
    },
    [],
  )

  const handlers: Handlers = useMemo(() => {
    const capture = (e: React.PointerEvent) => (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)

    if (mode === 'hold') {
      return {
        onPointerDown: (e) => {
          if (e.button !== 0) return
          capture(e)
          player.play()
        },
        onPointerUp: () => player.pause(),
        onPointerCancel: () => player.pause(),
        onLostPointerCapture: () => player.pause(),
      }
    }

    if (mode === 'scroll') {
      return {
        onPointerDown: (e) => {
          if (e.button !== 0) return
          capture(e)
          stopMomentum()
          drag.current = { y: e.clientY, t: performance.now(), v: 0, moved: 0 }
        },
        onPointerMove: (e) => {
          const d = drag.current
          if (!d) return
          const now = performance.now()
          const dy = d.y - e.clientY // finger up = forward, like scrolling a page
          const dt = Math.max(1, now - d.t)
          d.v = 0.7 * d.v + 0.3 * (dy / dt)
          d.moved += Math.abs(dy)
          d.y = e.clientY
          d.t = now
          consume(dy, SCROLL_PX_PER_WORD.drag)
        },
        onPointerUp: () => {
          const d = drag.current
          drag.current = null
          if (!d) return
          if (d.moved > 6) suppress()
          // Inertia: keep going and slow down, like a native scroll view.
          let v = d.v
          if (Math.abs(v) < 0.25) return
          let last = performance.now()
          const tick = () => {
            const now = performance.now()
            const dt = now - last
            last = now
            consume(v * dt, SCROLL_PX_PER_WORD.drag)
            v *= Math.pow(0.94, dt / 16)
            momentum.current = Math.abs(v) > 0.03 ? requestAnimationFrame(tick) : null
          }
          momentum.current = requestAnimationFrame(tick)
        },
        onPointerCancel: () => {
          drag.current = null
        },
      }
    }

    if (mode === 'gesture') {
      return {
        onPointerDown: (e) => {
          if (e.button !== 0) return
          capture(e)
          const p = { x0: e.clientX, y0: e.clientY, t0: performance.now(), x: e.clientX, y: e.clientY, holding: false, timer: null as ReturnType<typeof setTimeout> | null }
          p.timer = setTimeout(() => {
            if (press.current !== p) return
            p.holding = true
            p.timer = null
            applyRate(p.x)
            player.play()
          }, GESTURE_HOLD_DELAY_MS)
          press.current = p
        },
        onPointerMove: (e) => {
          const p = press.current
          if (!p) return
          p.x = e.clientX
          p.y = e.clientY
          if (p.holding) applyRate(p.x)
          else if (Math.abs(p.y - p.y0) > 12 && Math.abs(p.y - p.y0) > Math.abs(p.x - p.x0) && p.timer) {
            // Moving vertically before the hold starts: it's a flick, don't start reading.
            clearTimeout(p.timer)
            p.timer = null
          }
        },
        onPointerUp: () => endPress(true),
        onPointerCancel: () => endPress(false),
        onLostPointerCapture: () => endPress(false),
      }
    }

    // tap
    return { onClick: () => player.toggle() }
  }, [mode, player, consume, applyRate, endPress])

  return { handlers, scrubbing, shouldSuppressClick }
}
