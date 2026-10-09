import type { Block, BlockKind } from '../epub/types'

/**
 * Flat, cache-friendly representation of a book for RSVP playback.
 * Index `i` across every array refers to the same word.
 */
export interface TokenStream {
  words: string[]
  /** Duration multiplier (1 = one base interval). */
  pause: Float32Array
  /** Block index each word belongs to. */
  block: Uint32Array
  /** First word index of each block; length = blocks.length + 1 (sentinel = words.length). */
  blockStart: Uint32Array
  /** Prefix sums of `pause`; length = words.length + 1. Used for time estimates. */
  cumPause: Float64Array
}

export interface TokenizeOptions {
  language?: string
  /** Vary timing by punctuation, length and numbers. When false every word lasts 1 interval. */
  smartPauses?: boolean
}

const ALNUM = /[\p{L}\p{N}]/u
const OPENERS = /^[«“‘„‚¿¡([{—–\-"']+$/u
const SEGMENTED_LANGS = /^(zh|ja|th|lo|km|my)\b/

/** Split a block's text into display words, attaching stray punctuation to neighbours. */
export function splitWords(text: string, language = ''): string[] {
  const t = text
    .normalize('NFC')
    // "palabra—otra" / "wait…what": break after the dash or ellipsis.
    .replace(/([\p{L}\p{N}][—–]|…)(?=[\p{L}\p{N}«“¿¡])/gu, '$1 ')

  let raw: string[]
  if (SEGMENTED_LANGS.test(language) && typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(language, { granularity: 'word' })
    raw = []
    for (const s of seg.segment(t)) if (s.segment.trim()) raw.push(s.segment.trim())
  } else {
    raw = t.split(' ').filter(Boolean)
  }

  const out: string[] = []
  let carry = ''
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i]
    if (ALNUM.test(w)) {
      out.push(carry + w)
      carry = ''
    } else if (OPENERS.test(w) && i < raw.length - 1) {
      carry += w
    } else if (out.length) {
      out[out.length - 1] += w
    } else {
      carry += w
    }
  }
  if (carry) {
    if (out.length) out[out.length - 1] += carry
    else out.push(carry)
  }
  return out
}

function letterCount(w: string): number {
  let n = 0
  for (const ch of w) if (ALNUM.test(ch)) n++
  return n
}

/** Pause multiplier for a word. `blockEnd` marks the last word of a block. */
export function pauseFor(word: string, blockEnd: boolean, kind: BlockKind): number {
  let m = 1
  const core = word.replace(/[»”’"')\]}]+$/u, '')
  const last = core.slice(-1)
  if (/[.!?…]/.test(last)) m = 2.2
  else if (/[;:]/.test(last)) m = 1.8
  else if (/[,—–]/.test(last)) m = 1.5

  const letters = letterCount(word)
  if (letters > 7) m += Math.min(0.6, (letters - 7) * 0.08)
  if (/\d/.test(word)) m += 0.3
  if (kind === 'h') m += 0.4
  if (blockEnd) m = Math.max(m, kind === 'h' ? 3.2 : 2.8)
  return m
}

export function tokenize(blocks: Block[], opts: TokenizeOptions = {}): TokenStream {
  const smart = opts.smartPauses !== false
  const words: string[] = []
  const pauses: number[] = []
  const blockOf: number[] = []
  const blockStart = new Uint32Array(blocks.length + 1)

  for (let b = 0; b < blocks.length; b++) {
    blockStart[b] = words.length
    const ws = splitWords(blocks[b].text, opts.language)
    for (let j = 0; j < ws.length; j++) {
      words.push(ws[j])
      pauses.push(smart ? pauseFor(ws[j], j === ws.length - 1, blocks[b].kind) : 1)
      blockOf.push(b)
    }
  }
  blockStart[blocks.length] = words.length

  const pause = Float32Array.from(pauses)
  const cumPause = new Float64Array(words.length + 1)
  for (let i = 0; i < words.length; i++) cumPause[i + 1] = cumPause[i] + pause[i]

  return { words, pause, block: Uint32Array.from(blockOf), blockStart, cumPause }
}

/** Milliseconds needed to read words [from, to) at `wpm`. */
export function durationMs(stream: TokenStream, wpm: number, from: number, to = stream.words.length): number {
  const a = Math.max(0, Math.min(from, stream.words.length))
  const b = Math.max(a, Math.min(to, stream.words.length))
  return ((stream.cumPause[b] - stream.cumPause[a]) * 60000) / wpm
}

const SENTENCE_END = /[.!?…][»”’"')\]}]*$/u

/** Index of the first word of the sentence containing `i`. */
export function sentenceStart(stream: TokenStream, i: number): number {
  const blockFirst = stream.blockStart[stream.block[i] ?? 0]
  let j = i
  while (j > blockFirst && !SENTENCE_END.test(stream.words[j - 1])) j--
  return j
}

/** Start of the previous sentence (or of the current one if we are in its middle). */
export function prevSentence(stream: TokenStream, i: number): number {
  const cur = sentenceStart(stream, i)
  if (cur < i) return cur
  return cur === 0 ? 0 : sentenceStart(stream, cur - 1)
}

export function nextSentence(stream: TokenStream, i: number): number {
  const n = stream.words.length
  let j = i
  const startBlock = stream.block[i]
  while (j < n - 1) {
    j++
    if (stream.block[j] !== startBlock || SENTENCE_END.test(stream.words[j - 1])) return j
  }
  return n - 1
}
