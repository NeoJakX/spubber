import { describe, expect, it } from 'vitest'
import type { Block } from '../epub/types'
import { pivotIndex, splitAtPivot } from './orp'
import { RsvpPlayer, type Clock } from './player'
import { durationMs, nextSentence, pauseFor, prevSentence, splitWords, tokenize } from './tokenize'

const blocks = (...texts: string[]): Block[] => texts.map((text) => ({ kind: 'p', text, chapter: 0 }))

describe('splitWords', () => {
  it('splits on spaces and keeps punctuation attached', () => {
    expect(splitWords('Hola, mundo. ¿Qué tal?')).toEqual(['Hola,', 'mundo.', '¿Qué', 'tal?'])
  })
  it('attaches stray opening/closing marks to neighbours', () => {
    expect(splitWords('« Bonjour » dit-il')).toEqual(['«Bonjour»', 'dit-il'])
    expect(splitWords('uno — dijo él')).toEqual(['uno', '—dijo', 'él'])
  })
  it('breaks words joined by em-dashes and ellipses', () => {
    expect(splitWords('jamón—mucho jamón')).toEqual(['jamón—', 'mucho', 'jamón'])
    expect(splitWords('wait…what')).toEqual(['wait…', 'what'])
  })
  it('keeps Spanish dialogue dashes on the first word', () => {
    expect(splitWords('—Puedes llevarte uno —le dijo—.')).toEqual(['—Puedes', 'llevarte', 'uno', '—le', 'dijo—.'])
  })
  it('segments languages without spaces', () => {
    const w = splitWords('我喜欢读书。', 'zh')
    expect(w.length).toBeGreaterThan(1)
    expect(w.join('')).toBe('我喜欢读书。')
  })
})

describe('pivotIndex (ORP)', () => {
  it('follows the length table', () => {
    expect(pivotIndex('a')).toBe(0)
    expect(pivotIndex('casa')).toBe(1)
    expect(pivotIndex('lectura')).toBe(2)
    expect(pivotIndex('estanterías')).toBe(3)
    expect(pivotIndex('responsabilidades')).toBe(4)
  })
  it('ignores surrounding punctuation', () => {
    expect(pivotIndex('«Hola»')).toBe(2)
    expect(pivotIndex('¿Qué')).toBe(2)
    expect(splitAtPivot('«Hola»,')).toEqual(['«H', 'o', 'la»,'])
  })
  it('never lands on an inner hyphen', () => {
    expect(splitAtPivot('fin-positivo,')).toEqual(['fin-', 'p', 'ositivo,'])
  })
  it('supports a middle-letter mode', () => {
    expect(splitAtPivot('hacia', 'center')).toEqual(['ha', 'c', 'ia'])
    expect(splitAtPivot('«Hola»', 'center')).toEqual(['«H', 'o', 'la»'])
    expect(splitAtPivot('a', 'center')).toEqual(['', 'a', ''])
  })
  it('handles words made only of symbols', () => {
    expect(splitAtPivot('—')).toEqual(['', '—', ''])
  })
})

describe('pauseFor', () => {
  it('weights punctuation, length, numbers and paragraph ends', () => {
    expect(pauseFor('casa', false, 'p')).toBe(1)
    expect(pauseFor('casa,', false, 'p')).toBe(1.5)
    expect(pauseFor('casa;', false, 'p')).toBe(1.8)
    expect(pauseFor('casa.', false, 'p')).toBe(2.2)
    expect(pauseFor('casa.»', false, 'p')).toBe(2.2)
    expect(pauseFor('casa', true, 'p')).toBe(2.8)
    expect(pauseFor('1984', false, 'p')).toBeCloseTo(1.3)
    expect(pauseFor('extraordinariamente', false, 'p')).toBeCloseTo(1.6)
  })
})

describe('tokenize', () => {
  const s = tokenize(blocks('Uno dos. Tres cuatro.', 'Cinco seis siete.'))
  it('maps words to blocks', () => {
    expect(s.words).toEqual(['Uno', 'dos.', 'Tres', 'cuatro.', 'Cinco', 'seis', 'siete.'])
    expect(Array.from(s.blockStart)).toEqual([0, 4, 7])
    expect(Array.from(s.block)).toEqual([0, 0, 0, 0, 1, 1, 1])
  })
  it('computes durations from prefix sums', () => {
    const flat = tokenize(blocks('a b c d'), { smartPauses: false })
    expect(durationMs(flat, 600, 0)).toBe(400)
    expect(durationMs(flat, 600, 2)).toBe(200)
  })
  it('navigates by sentence', () => {
    expect(nextSentence(s, 0)).toBe(2)
    expect(nextSentence(s, 2)).toBe(4)
    expect(prevSentence(s, 3)).toBe(2)
    expect(prevSentence(s, 2)).toBe(0)
    expect(prevSentence(s, 5)).toBe(4)
  })
})

/** Deterministic clock with optional per-callback jitter. */
function fakeClock(jitter = 0) {
  let t = 0
  const q: { at: number; fn: () => void; id: number }[] = []
  let id = 0
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => {
      q.push({ at: t + ms + jitter, fn, id: ++id })
      return id
    },
    clearTimeout: (h) => {
      const i = q.findIndex((x) => x.id === h)
      if (i >= 0) q.splice(i, 1)
    },
  }
  const advance = (ms: number) => {
    const end = t + ms
    for (;;) {
      q.sort((a, b) => a.at - b.at)
      const next = q[0]
      if (!next || next.at > end) break
      q.shift()
      t = next.at
      next.fn()
    }
    t = end
  }
  return { clock, advance, time: () => t }
}

describe('RsvpPlayer', () => {
  const flat = tokenize(blocks(Array.from({ length: 1000 }, (_, i) => `w${i}`).join(' ')), { smartPauses: false })

  it('keeps the requested pace without drift despite timer jitter', () => {
    const { clock, advance } = fakeClock(3) // every timer fires 3 ms late
    const p = new RsvpPlayer(flat, { wpm: 600, clock })
    p.play()
    advance(60_000) // one minute at 600 wpm, minus the ramp-up
    const shown = p.getState().index
    // Ramp costs (0.6+0.3+0.12) intervals ≈ 1 word; jitter must not accumulate.
    expect(shown).toBeGreaterThanOrEqual(597)
    expect(shown).toBeLessThanOrEqual(600)
  })

  it('pauses, resumes with rewind and stops at the end', () => {
    const { clock, advance } = fakeClock()
    const p = new RsvpPlayer(tokenize(blocks('a b c d e f g h')), { wpm: 600, clock, rewindWords: 2, rewindAfterMs: 1000 })
    p.play()
    advance(450)
    const before = p.getState().index
    expect(before).toBeGreaterThan(1)
    p.pause()
    advance(2000)
    p.play()
    expect(p.getState().index).toBe(before - 2)
    advance(10_000)
    expect(p.getState()).toMatchObject({ playing: false, finished: true, index: 7 })
  })

  it('does not rewind after a short pause (hold mode taps)', () => {
    const { clock, advance } = fakeClock()
    const p = new RsvpPlayer(flat, { wpm: 300, clock, rewindWords: 3, rewindAfterMs: 1500 })
    p.seek(50)
    p.play()
    p.pause()
    advance(500)
    p.play()
    expect(p.getState().index).toBe(50)
  })

  it('clamps speed and seeks', () => {
    const p = new RsvpPlayer(flat)
    p.setWpm(5000)
    expect(p.getState().wpm).toBe(1000)
    p.setWpm(10)
    expect(p.getState().wpm).toBe(100)
    p.seek(99999)
    expect(p.getState().index).toBe(999)
  })

  it('notifies subscribers', () => {
    const p = new RsvpPlayer(flat)
    let n = 0
    p.subscribe(() => n++)
    p.step(1)
    p.setWpm(400)
    expect(n).toBe(2)
  })
})
