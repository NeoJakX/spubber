import type { Block, BlockKind } from './types'
import { attr, localName, normalizeText } from './util'

const SKIP = new Set([
  'script', 'style', 'head', 'title', 'rt', 'rp', 'svg', 'math', 'noscript', 'template',
  'iframe', 'object', 'embed', 'video', 'audio', 'button', 'input', 'select', 'textarea', 'img',
])

const BLOCK = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'dd', 'dt',
  'td', 'th', 'figcaption', 'section', 'article', 'aside', 'header', 'footer', 'main', 'body',
  'ul', 'ol', 'dl', 'table', 'tr', 'tbody', 'thead', 'figure', 'hr', 'address', 'center',
  'caption', 'nav', 'hgroup', 'details', 'summary',
])

const NOTE_TYPES = /\b(noteref|footnote|rearnote|annoref)\b/

function kindFor(tag: string, parent: BlockKind): BlockKind {
  if (/^h[1-6]$/.test(tag)) return 'h'
  if (tag === 'blockquote') return 'quote'
  if (tag === 'li' || tag === 'dd' || tag === 'dt') return parent === 'quote' ? 'quote' : 'li'
  if (tag === 'pre') return 'pre'
  return parent
}

/** True for inline footnote markers such as <a epub:type="noteref">1</a> or <sup><a href="#n1">1</a></sup>. */
function isNoteMarker(el: Element, tag: string): boolean {
  const type = `${attr(el, 'type') ?? ''} ${el.getAttribute('role') ?? ''}`
  if (NOTE_TYPES.test(type) || /doc-(noteref|footnote|endnote)/.test(type)) {
    // Footnote bodies inside the chapter (aside) and markers are both skipped.
    return tag !== 'section' && tag !== 'div' && tag !== 'body'
  }
  if (tag === 'sup' || tag === 'sub') {
    const text = (el.textContent ?? '').trim()
    if (text.length <= 4 && /^[\[(]?[\d*†‡§a-z]{1,3}[\])]?$/i.test(text) && el.getElementsByTagName('a').length > 0) {
      return true
    }
  }
  return false
}

export interface ExtractResult {
  blocks: Block[]
  /** element id -> index (relative to the global block list) of the block containing it */
  anchors: Map<string, number>
}

/**
 * Walk a content document and append its readable text as blocks.
 * `offset` is the global index the first new block will receive.
 */
export function extractBlocks(doc: Document, chapter: number, offset: number): ExtractResult {
  const blocks: Block[] = []
  const anchors = new Map<string, number>()
  const body = doc.body ?? doc.getElementsByTagName('body')[0] ?? doc.documentElement
  let buf = ''

  const flush = (kind: BlockKind) => {
    const text = normalizeText(buf)
    buf = ''
    if (text) blocks.push({ kind, text, chapter })
  }

  const walk = (node: Node, kind: BlockKind) => {
    if (node.nodeType === 3 /* TEXT */ || node.nodeType === 4 /* CDATA */) {
      buf += (node as Text).data
      return
    }
    if (node.nodeType !== 1) return
    const el = node as Element
    const tag = localName(el)
    if (SKIP.has(tag)) return
    if (isNoteMarker(el, tag)) return

    const isBlock = BLOCK.has(tag)
    // Text pending before a block element belongs to the previous block.
    if (isBlock) flush(kind)

    const id = el.getAttribute('id') ?? el.getAttribute('name')
    if (id && !anchors.has(id)) anchors.set(id, offset + blocks.length)

    if (tag === 'br') {
      buf += ' '
      return
    }
    if (isBlock) {
      const inner = kindFor(tag, kind)
      for (let c = el.firstChild; c; c = c.nextSibling) walk(c, inner)
      flush(inner)
      return
    }
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c, kind)
  }

  walk(body, 'p')
  flush('p')
  return { blocks, anchors }
}
