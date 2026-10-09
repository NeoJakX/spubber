import type { TokenStream } from '../../core/rsvp/tokenize'
import type { BookRecord } from '../../db/db'

export function excerptAt(stream: TokenStream, index: number, n = 14) {
  return stream.words.slice(index, index + n).join(' ')
}

export function chapterIndexAt(book: BookRecord, stream: TokenStream, index: number): number {
  const block = stream.block[index] ?? 0
  let ch = 0
  for (let i = 0; i < book.chapters.length; i++) {
    if (book.chapters[i].firstBlock <= block) ch = i
    else break
  }
  return ch
}
