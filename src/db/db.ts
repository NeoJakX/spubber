import Dexie, { type EntityTable } from 'dexie'
import type { Block } from '../core/epub/types'

/** Bump when tokenisation changes in a way that shifts word indices. */
export const TOKENIZER_VERSION = 1

export interface ChapterRef {
  title: string
  firstBlock: number
}

export interface TocRef {
  label: string
  depth: number
  block: number
}

export interface BookRecord {
  id: string
  title: string
  author: string
  language: string
  publisher?: string
  description?: string
  cover?: Blob
  fileName: string
  fileHash: string
  fileSize: number
  addedAt: number
  openedAt: number
  /** Current word index. */
  position: number
  totalWords: number
  /** Sum of pause multipliers for the whole book (time estimates without loading content). */
  totalPause: number
  chapters: ChapterRef[]
  toc: TocRef[]
  tokenizerVersion: number
  finished?: boolean
}

export interface ContentRecord {
  bookId: string
  blocks: Block[]
}

export interface FileRecord {
  bookId: string
  data: Blob
}

export interface BookmarkRecord {
  id: string
  bookId: string
  word: number
  note: string
  excerpt: string
  createdAt: number
}

export class SpubberDb extends Dexie {
  books!: EntityTable<BookRecord, 'id'>
  contents!: EntityTable<ContentRecord, 'bookId'>
  files!: EntityTable<FileRecord, 'bookId'>
  bookmarks!: EntityTable<BookmarkRecord, 'id'>

  constructor() {
    super('spubber')
    this.version(1).stores({
      books: 'id, fileHash, openedAt, addedAt',
      contents: 'bookId',
      files: 'bookId',
      bookmarks: 'id, bookId, [bookId+word]',
    })
  }
}

export const db = new SpubberDb()

export function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
