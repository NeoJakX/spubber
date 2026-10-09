const ALNUM = /[\p{L}\p{N}]/u

/**
 * Optimal Recognition Point: index (UTF-16) of the letter the eye should fixate.
 * Leading/trailing punctuation is ignored when measuring the word, so
 * "«Hola»" pivots on the same letter as "Hola".
 */
export function pivotIndex(word: string): number {
  const chars = Array.from(word)
  let start = 0
  while (start < chars.length && !ALNUM.test(chars[start])) start++
  if (start === chars.length) return Math.max(0, Math.floor((word.length - 1) / 2))
  let end = chars.length - 1
  while (end > start && !ALNUM.test(chars[end])) end--
  const len = end - start + 1
  const offset = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4
  // Convert code-point index back to a UTF-16 index.
  return chars.slice(0, start + offset).join('').length
}

/** Split a word into the three parts rendered around the fixed axis. */
export function splitAtPivot(word: string): [string, string, string] {
  const i = pivotIndex(word)
  const cp = word.codePointAt(i)
  const len = cp !== undefined && cp > 0xffff ? 2 : 1
  return [word.slice(0, i), word.slice(i, i + len), word.slice(i + len)]
}
