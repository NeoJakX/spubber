/** Kind of a text block, used for pause weighting and the context view styling. */
export type BlockKind = 'p' | 'h' | 'quote' | 'li' | 'pre'

export interface Block {
  kind: BlockKind
  /** Normalised plain text (single spaces, no soft hyphens). */
  text: string
  /** Index into `ParsedBook.chapters`. */
  chapter: number
}

export interface Chapter {
  /** Path of the content document inside the zip. */
  href: string
  /** Best-effort title (TOC label or first heading). May be empty. */
  title: string
  /** Index of the first block of this chapter. */
  firstBlock: number
}

export interface TocEntry {
  label: string
  depth: number
  /** Block index the entry points to. */
  block: number
}

export interface CoverImage {
  data: Uint8Array
  mime: string
}

export interface ParsedBook {
  title: string
  author: string
  language: string
  publisher?: string
  description?: string
  identifier?: string
  cover?: CoverImage
  blocks: Block[]
  chapters: Chapter[]
  toc: TocEntry[]
}

export type EpubErrorCode = 'NOT_ZIP' | 'NO_CONTAINER' | 'NO_OPF' | 'DRM' | 'EMPTY'

export class EpubError extends Error {
  readonly code: EpubErrorCode
  constructor(code: EpubErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'EpubError'
  }
}
