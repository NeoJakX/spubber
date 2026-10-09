const ALNUM = /[\p{L}\p{N}]/u

/**
 * How the focus letter is chosen:
 * - 'orp'    Optimal Recognition Point, slightly left of centre (~30–35 % into the word),
 *            where the eye recognises a word fastest. The classic RSVP choice.
 * - 'center' The middle letter of the word.
 */
export type PivotMode = 'orp' | 'center'

/**
 * Index (UTF-16) of the letter the eye should fixate.
 * Leading/trailing punctuation is ignored when measuring the word, so
 * "«Hola»" pivots on the same letter as "Hola", and the pivot never lands
 * on an inner hyphen or apostrophe.
 */
export function pivotIndex(word: string, mode: PivotMode = 'orp'): number {
  const chars = Array.from(word)
  let start = 0
  while (start < chars.length && !ALNUM.test(chars[start])) start++
  if (start === chars.length) return chars.slice(0, Math.max(0, Math.floor((chars.length - 1) / 2))).join('').length
  let end = chars.length - 1
  while (end > start && !ALNUM.test(chars[end])) end--
  const len = end - start + 1
  const offset =
    mode === 'center'
      ? Math.floor((len - 1) / 2)
      : len <= 1
        ? 0
        : len <= 5
          ? 1
          : len <= 9
            ? 2
            : len <= 13
              ? 3
              : 4
  let i = start + offset
  // "fin-positivo": never highlight the hyphen itself.
  while (i < end && !ALNUM.test(chars[i])) i++
  return chars.slice(0, i).join('').length
}

/** Split a word into the three parts rendered around the fixed axis. */
export function splitAtPivot(word: string, mode: PivotMode = 'orp'): [string, string, string] {
  const i = pivotIndex(word, mode)
  const cp = word.codePointAt(i)
  const len = cp !== undefined && cp > 0xffff ? 2 : 1
  return [word.slice(0, i), word.slice(i, i + len), word.slice(i + len)]
}
