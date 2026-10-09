import { parseEpub } from '../core/epub/parse'
import { EpubError, type Block } from '../core/epub/types'
import { tokenize } from '../core/rsvp/tokenize'
import { db, newId, TOKENIZER_VERSION, type BookmarkRecord, type BookRecord } from './db'

export type ImportResult =
  | { ok: true; book: BookRecord; duplicate: boolean }
  | { ok: false; code: 'NOT_EPUB' | 'STORAGE' | 'UNKNOWN' | EpubError['code'] }

async function hashBytes(bytes: Uint8Array): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Non-secure contexts have no SubtleCrypto: a cheap FNV-1a fingerprint is enough to spot duplicates.
    let h = 0x811c9dc5
    for (let i = 0; i < bytes.length; i += 7) h = Math.imul(h ^ bytes[i], 0x01000193)
    return `fnv-${(h >>> 0).toString(16)}-${bytes.length}`
  }
}

export async function importEpub(
  file: Blob,
  fileName: string,
  onProgress?: (f: number) => void,
): Promise<ImportResult> {
  if (!/\.epub$/i.test(fileName) && file.type !== 'application/epub+zip') return { ok: false, code: 'NOT_EPUB' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileHash = await hashBytes(bytes)
  const existing = await db.books.where('fileHash').equals(fileHash).first()
  if (existing) return { ok: true, book: existing, duplicate: true }

  let parsed
  try {
    parsed = await parseEpub(bytes, { onProgress })
  } catch (e) {
    if (e instanceof EpubError) return { ok: false, code: e.code }
    console.error(e)
    return { ok: false, code: 'UNKNOWN' }
  }
  const stream = tokenize(parsed.blocks, { language: parsed.language })
  const now = Date.now()
  const book: BookRecord = {
    id: newId(),
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    publisher: parsed.publisher,
    description: parsed.description,
    cover: parsed.cover ? new Blob([parsed.cover.data as BlobPart], { type: parsed.cover.mime }) : undefined,
    fileName,
    fileHash,
    fileSize: bytes.length,
    addedAt: now,
    openedAt: 0,
    position: 0,
    totalWords: stream.words.length,
    totalPause: stream.cumPause[stream.words.length],
    chapters: parsed.chapters.map((c) => ({ title: c.title, firstBlock: c.firstBlock })),
    toc: parsed.toc,
    tokenizerVersion: TOKENIZER_VERSION,
  }
  try {
    await db.transaction('rw', db.books, db.contents, db.files, async () => {
      await db.books.add(book)
      await db.contents.add({ bookId: book.id, blocks: parsed.blocks })
      await db.files.add({ bookId: book.id, data: new Blob([bytes as BlobPart], { type: 'application/epub+zip' }) })
    })
  } catch (e) {
    console.error(e)
    const name = (e as { name?: string; inner?: { name?: string } })?.inner?.name ?? (e as Error)?.name
    return { ok: false, code: name === 'QuotaExceededError' ? 'STORAGE' : 'UNKNOWN' }
  }
  return { ok: true, book, duplicate: false }
}

export async function loadBook(id: string): Promise<{ book: BookRecord; blocks: Block[] } | null> {
  const [book, content] = await Promise.all([db.books.get(id), db.contents.get(id)])
  if (!book || !content) return null
  return { book, blocks: content.blocks }
}

export async function deleteBook(id: string) {
  await db.transaction('rw', [db.books, db.contents, db.files, db.bookmarks], async () => {
    await db.books.delete(id)
    await db.contents.delete(id)
    await db.files.delete(id)
    await db.bookmarks.where('bookId').equals(id).delete()
  })
}

export async function savePosition(id: string, position: number, finished = false) {
  await db.books.update(id, { position, openedAt: Date.now(), finished })
}

export async function markOpened(id: string) {
  await db.books.update(id, { openedAt: Date.now() })
}

export async function addBookmark(bookId: string, word: number, excerpt: string, note = ''): Promise<BookmarkRecord> {
  const bm: BookmarkRecord = { id: newId(), bookId, word, excerpt, note: note.trim(), createdAt: Date.now() }
  await db.bookmarks.add(bm)
  return bm
}

export async function deleteBookmark(id: string) {
  await db.bookmarks.delete(id)
}

export async function restoreBookmark(bm: BookmarkRecord) {
  await db.bookmarks.put(bm)
}
