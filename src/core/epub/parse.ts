import { unzipSync } from 'fflate'
import { extractBlocks } from './extract'
import { EpubError, type Block, type Chapter, type CoverImage, type ParsedBook, type TocEntry } from './types'
import { attr, byLocalName, decodeText, fragmentOf, localName, normalizeText, parseXhtml, parseXml, resolvePath } from './util'

interface ManifestItem {
  id: string
  href: string // resolved zip path
  mediaType: string
  properties: string
}

interface RawToc {
  label: string
  depth: number
  path: string
  fragment: string
}

export interface ParseOptions {
  onProgress?: (fraction: number) => void
}

/** Font-obfuscation algorithms are not DRM: fonts are scrambled, text is readable. */
const FONT_OBFUSCATION = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
])

class Zip {
  private files: Record<string, Uint8Array>
  private lower = new Map<string, string>()
  constructor(files: Record<string, Uint8Array>) {
    this.files = files
    for (const k of Object.keys(files)) this.lower.set(k.toLowerCase(), k)
  }
  has(path: string) {
    return this.get(path) !== undefined
  }
  get(path: string): Uint8Array | undefined {
    return this.files[path] ?? this.files[this.lower.get(path.toLowerCase()) ?? '']
  }
  paths(): string[] {
    return Object.keys(this.files)
  }
  text(path: string): string | undefined {
    const b = this.get(path)
    return b ? decodeText(b) : undefined
  }
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0))

export async function parseEpub(input: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): Promise<ParsedBook> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new EpubError('NOT_ZIP')

  let zip: Zip
  try {
    zip = new Zip(unzipSync(bytes))
  } catch {
    throw new EpubError('NOT_ZIP')
  }

  // 1. container.xml -> OPF path
  const containerText = zip.text('META-INF/container.xml')
  let opfPath: string | undefined
  if (containerText) {
    const container = parseXml(containerText)
    const rootfile = container ? byLocalName(container, 'rootfile')[0] : undefined
    opfPath = rootfile?.getAttribute('full-path') ?? undefined
  }
  if (!opfPath || !zip.has(opfPath)) {
    // Broken container: fall back to the first .opf in the archive.
    opfPath = zip.paths().find((k) => k.toLowerCase().endsWith('.opf'))
    if (!opfPath) throw new EpubError(containerText ? 'NO_OPF' : 'NO_CONTAINER')
  }
  const opf = parseXml(zip.text(opfPath) ?? '')
  if (!opf) throw new EpubError('NO_OPF')

  // 2. Manifest & spine
  const manifest = new Map<string, ManifestItem>()
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      id,
      href: resolvePath(opfPath, href),
      mediaType: (item.getAttribute('media-type') ?? '').toLowerCase(),
      properties: item.getAttribute('properties') ?? '',
    })
  }
  const spineEl = byLocalName(opf, 'spine')[0]
  const spine: ManifestItem[] = []
  for (const ref of spineEl ? byLocalName(spineEl, 'itemref') : []) {
    const it = manifest.get(ref.getAttribute('idref') ?? '')
    if (it && zip.has(it.href)) spine.push(it)
  }

  // 3. DRM check (after we know the spine)
  checkDrm(zip, spine)

  // 4. Metadata
  const meta = readMetadata(opf)

  // 5. Table of contents (nav for EPUB3, NCX for EPUB2)
  const rawToc = readToc(zip, opf, manifest, spineEl)

  // 6. Content
  const blocks: Block[] = []
  const chapters: Chapter[] = []
  const anchorIndex = new Map<string, number>() // "path#id" or "path" -> block index
  for (let i = 0; i < spine.length; i++) {
    const item = spine[i]
    const text = zip.text(item.href)
    if (!text) continue
    const doc = parseXhtml(text)
    anchorIndex.set(item.href, blocks.length)
    // Navigation pages (EPUB3 nav in the spine, inline HTML TOCs) are useless in RSVP.
    if (/\bnav\b/.test(item.properties) || isLinkListPage(doc)) continue
    const chapterIdx = chapters.length
    const { blocks: newBlocks, anchors } = extractBlocks(doc, chapterIdx, blocks.length)
    for (const [id, idx] of anchors) anchorIndex.set(`${item.href}#${id}`, idx)
    if (newBlocks.length === 0) continue
    const firstHeading = newBlocks.find((b) => b.kind === 'h')
    chapters.push({ href: item.href, title: firstHeading?.text ?? '', firstBlock: blocks.length })
    for (const b of newBlocks) blocks.push(b)
    opts.onProgress?.((i + 1) / spine.length)
    if (i % 4 === 3) await yieldToUi()
  }
  if (blocks.length === 0) throw new EpubError('EMPTY')

  // 7. Resolve TOC targets to block indices
  const toc: TocEntry[] = []
  for (const t of rawToc) {
    let idx = t.fragment ? anchorIndex.get(`${t.path}#${t.fragment}`) : undefined
    if (idx === undefined) idx = anchorIndex.get(t.path)
    if (idx === undefined || !t.label) continue
    toc.push({ label: t.label, depth: t.depth, block: Math.min(idx, blocks.length - 1) })
  }
  // Prefer TOC labels as chapter titles when they point at a chapter start.
  for (const t of toc) {
    const ch = chapters.find((c) => c.firstBlock === t.block)
    if (ch && t.depth === 0) ch.title = t.label
  }
  const finalToc: TocEntry[] =
    toc.length > 0
      ? toc
      : chapters.map((c) => ({ label: c.title, depth: 0, block: c.firstBlock })).filter((t) => t.label)

  return {
    ...meta,
    cover: readCover(zip, opf, manifest, spine),
    blocks,
    chapters,
    toc: finalToc,
  }
}

/** A page whose text is almost entirely hyperlinks (a printed table of contents). */
function isLinkListPage(doc: Document): boolean {
  const body = doc.body ?? byLocalName(doc, 'body')[0]
  if (!body) return false
  const total = normalizeText(body.textContent ?? '').length
  if (total === 0) return false
  const links = byLocalName(body, 'a').filter((a) => a.getAttribute('href'))
  if (links.length < 3) return false
  const linked = links.reduce((n, a) => n + normalizeText(a.textContent ?? '').length, 0)
  return linked / total > 0.75
}

function checkDrm(zip: Zip, spine: ManifestItem[]) {
  if (zip.has('META-INF/license.lcpl')) throw new EpubError('DRM', 'Readium LCP')
  const enc = zip.text('META-INF/encryption.xml')
  if (!enc) return
  const doc = parseXml(enc)
  if (!doc) return
  const spinePaths = new Set(spine.map((s) => s.href.toLowerCase()))
  for (const data of byLocalName(doc, 'encrypteddata')) {
    const alg = byLocalName(data, 'encryptionmethod')[0]?.getAttribute('Algorithm') ?? ''
    const uri = byLocalName(data, 'cipherreference')[0]?.getAttribute('URI') ?? ''
    if (FONT_OBFUSCATION.has(alg)) continue
    const path = resolvePath('', uri).toLowerCase()
    if (spinePaths.has(path) || /\.(x?html?|xml)$/.test(path)) throw new EpubError('DRM')
  }
}

function readMetadata(opf: Document) {
  const first = (name: string) => {
    const el = byLocalName(opf, name)[0]
    return el ? normalizeText(el.textContent ?? '') : ''
  }
  const creators = byLocalName(opf, 'creator')
    .map((c) => normalizeText(c.textContent ?? ''))
    .filter(Boolean)
  const description = first('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return {
    title: first('title') || 'Untitled',
    author: creators.slice(0, 2).join(', '),
    language: (first('language') || 'und').toLowerCase(),
    publisher: first('publisher') || undefined,
    description: description || undefined,
    identifier: first('identifier') || undefined,
  }
}

function readToc(zip: Zip, opf: Document, manifest: Map<string, ManifestItem>, spineEl?: Element): RawToc[] {
  // EPUB3 navigation document
  const navItem = [...manifest.values()].find((m) => /\bnav\b/.test(m.properties))
  if (navItem) {
    const text = zip.text(navItem.href)
    if (text) {
      const doc = parseXhtml(text)
      const navs = byLocalName(doc, 'nav')
      const tocNav = navs.find((n) => /\btoc\b/.test(attr(n, 'type') ?? '')) ?? navs[0]
      const ol = tocNav ? byLocalName(tocNav, 'ol')[0] : undefined
      if (ol) {
        const out: RawToc[] = []
        walkNavList(ol, 0, navItem.href, out)
        if (out.length) return out
      }
    }
  }
  // EPUB2 NCX
  const ncxId = spineEl?.getAttribute('toc')
  const ncxItem = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.mediaType === 'application/x-dtbncx+xml')
  if (ncxItem) {
    const text = zip.text(ncxItem.href)
    const doc = text ? parseXml(text) : null
    const navMap = doc ? byLocalName(doc, 'navmap')[0] : undefined
    if (navMap) {
      const out: RawToc[] = []
      walkNavPoints(navMap, 0, ncxItem.href, out)
      return out
    }
  }
  void opf
  return []
}

function walkNavList(ol: Element, depth: number, base: string, out: RawToc[]) {
  for (let li = ol.firstElementChild; li; li = li.nextElementSibling) {
    if (localName(li) !== 'li') continue
    let link: Element | undefined
    let sub: Element | undefined
    for (let c = li.firstElementChild; c; c = c.nextElementSibling) {
      const n = localName(c)
      if (!link && (n === 'a' || n === 'span')) link = c
      else if (n === 'ol') sub = c
    }
    const href = link?.getAttribute('href')
    if (link && href) {
      out.push({ label: normalizeText(link.textContent ?? ''), depth, path: resolvePath(base, href), fragment: fragmentOf(href) })
    }
    if (sub) walkNavList(sub, href ? depth + 1 : depth, base, out)
  }
}

function walkNavPoints(parent: Element, depth: number, base: string, out: RawToc[]) {
  for (let np = parent.firstElementChild; np; np = np.nextElementSibling) {
    if (localName(np) !== 'navpoint') continue
    let label = ''
    let src = ''
    for (let c = np.firstElementChild; c; c = c.nextElementSibling) {
      const n = localName(c)
      if (n === 'navlabel') label = normalizeText(c.textContent ?? '')
      else if (n === 'content') src = c.getAttribute('src') ?? ''
    }
    if (src) out.push({ label, depth, path: resolvePath(base, src), fragment: fragmentOf(src) })
    walkNavPoints(np, depth + 1, base, out)
  }
}

function readCover(zip: Zip, opf: Document, manifest: Map<string, ManifestItem>, spine: ManifestItem[]): CoverImage | undefined {
  const isImage = (m?: ManifestItem) => !!m && m.mediaType.startsWith('image/') && zip.has(m.href)
  const pick = (m?: ManifestItem): CoverImage | undefined =>
    m && isImage(m) ? { data: zip.get(m.href)!, mime: m.mediaType } : undefined

  const items = [...manifest.values()]
  // EPUB3: properties="cover-image"
  let found = pick(items.find((m) => /\bcover-image\b/.test(m.properties)))
  if (found) return found
  // EPUB2: <meta name="cover" content="id">
  const metaCover = byLocalName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')
  const coverId = metaCover?.getAttribute('content')
  if (coverId) {
    found = pick(manifest.get(coverId) ?? items.find((m) => m.href.endsWith(coverId)))
    if (found) return found
  }
  // Heuristic: an image whose id or path mentions "cover".
  found = pick(items.find((m) => isImage(m) && /cover/i.test(m.id + ' ' + m.href)))
  if (found) return found
  // First image referenced from the first spine document.
  const first = spine[0]
  const text = first && zip.text(first.href)
  if (text) {
    const doc = parseXhtml(text)
    const img = byLocalName(doc, 'img')[0] ?? byLocalName(doc, 'image')[0]
    const src = img?.getAttribute('src') ?? (img ? attr(img, 'href') : null)
    if (src) {
      const path = resolvePath(first.href, src)
      const m = items.find((it) => it.href === path)
      if (m) return pick(m)
    }
  }
  return undefined
}
