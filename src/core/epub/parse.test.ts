import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEpub } from './parse'
import { EpubError } from './types'
import { resolvePath } from './util'

const load = (p: string) => new Uint8Array(readFileSync(resolve(__dirname, '../../..', p)))

describe('resolvePath', () => {
  it('handles relative segments, escapes and fragments', () => {
    expect(resolvePath('OEBPS/content.opf', 'Text/Chapter%201.xhtml#x')).toBe('OEBPS/Text/Chapter 1.xhtml')
    expect(resolvePath('OEBPS/Text/a.xhtml', '../Images/b.png')).toBe('OEBPS/Images/b.png')
    expect(resolvePath('a/b/c.xhtml', './d.xhtml')).toBe('a/b/d.xhtml')
    expect(resolvePath('', 'META-INF/x.xml')).toBe('META-INF/x.xml')
  })
})

describe('parseEpub: pandoc EPUB3 (Spanish demo)', async () => {
  const book = await parseEpub(load('src/assets/samples/bienvenido-a-spubber.epub'))

  it('reads metadata', () => {
    expect(book.title).toBe('Bienvenido a Spubber')
    expect(book.author).toBe('Equipo Spubber')
    expect(book.language).toBe('es-es')
  })
  it('finds the cover image', () => {
    expect(book.cover?.mime).toBe('image/png')
    expect(book.cover?.data.length).toBeGreaterThan(1000)
  })
  it('extracts chapters in spine order', () => {
    const titles = book.chapters.map((c) => c.title)
    expect(titles).toContain('Leer sin mover los ojos')
    expect(titles.indexOf('Cómo se usa')).toBeGreaterThan(titles.indexOf('Leer sin mover los ojos'))
    expect(titles.at(-1)).toBe('Un texto para practicar')
  })
  it('builds a TOC that points at the right blocks', () => {
    const entry = book.toc.find((t) => t.label === 'Consejos para entrenar')!
    expect(entry).toBeDefined()
    expect(book.blocks[entry.block].text).toBe('Consejos para entrenar')
    expect(book.blocks[entry.block].kind).toBe('h')
  })
  it('keeps paragraph text with accents and dialogue dashes', () => {
    expect(book.blocks.some((b) => b.text.startsWith('—Puedes llevarte uno'))).toBe(true)
    expect(book.blocks.every((b) => !/\s{2,}/.test(b.text))).toBe(true)
  })
})

describe('parseEpub: pandoc EPUB2 (English demo, NCX only)', async () => {
  const book = await parseEpub(load('src/assets/samples/welcome-to-spubber.epub'))
  it('parses metadata, cover and NCX toc', () => {
    expect(book.title).toBe('Welcome to Spubber')
    expect(book.cover).toBeDefined()
    expect(book.toc.map((t) => t.label)).toContain('Training tips')
  })
})

describe('parseEpub: quirky EPUB2', async () => {
  const book = await parseEpub(load('fixtures/quirky-epub2.epub'))
  const all = book.blocks.map((b) => b.text)

  it('joins multiple creators and keeps language', () => {
    expect(book.author).toBe('Ada Tester, Bo Example')
    expect(book.language).toBe('es')
    expect(book.description).toBe('A test book.')
  })
  it('decodes windows-1252 and HTML entities via the HTML fallback', () => {
    expect(all).toContain('Capítulo uno')
    expect(all.some((t) => t.startsWith('El niño comió piñas y jamón—mucho jamón.'))).toBe(true)
  })
  it('removes soft hyphens, footnote markers, scripts and footnote bodies', () => {
    expect(all).toContain('Segundo párrafo con cursiva y negrita. Una línea nueva.')
    expect(all.some((t) => t.includes('jamón.1'))).toBe(false)
    expect(all.some((t) => t.includes('var x'))).toBe(false)
    expect(all.some((t) => t.includes('Esta nota no se lee'))).toBe(false)
    expect(all.some((t) => t.startsWith('Texto con nota final.'))).toBe(true)
  })
  it('tags block kinds', () => {
    expect(book.blocks.find((b) => b.text === 'Una cita célebre.')?.kind).toBe('quote')
    expect(book.blocks.find((b) => b.text === 'Primero')?.kind).toBe('li')
  })
  it('skips image-only pages and resolves case-mismatched paths', () => {
    expect(book.chapters).toHaveLength(2)
    expect(all).toContain('Último capítulo. «Comillas» al final.')
  })
  it('resolves nested NCX entries with fragments', () => {
    expect(book.toc.map((t) => [t.label, t.depth])).toEqual([
      ['Capítulo uno', 0],
      ['Una sección', 1],
      ['Capítulo dos', 0],
    ])
    const sec = book.toc[1]
    expect(book.blocks[sec.block].text).toBe('Una sección')
  })
  it('finds the cover via <meta name="cover">', () => {
    expect(book.cover?.mime).toBe('image/png')
  })
})

describe('parseEpub: errors', () => {
  const codeOf = async (p: string) => {
    try {
      await parseEpub(load(p))
      return 'ok'
    } catch (e) {
      return e instanceof EpubError ? e.code : String(e)
    }
  }
  it('rejects files that are not zips', async () => {
    expect(await codeOf('fixtures/not-a-zip.epub')).toBe('NOT_ZIP')
  })
  it('detects DRM-encrypted content', async () => {
    expect(await codeOf('fixtures/drm.epub')).toBe('DRM')
  })
  it('accepts font obfuscation, which is not DRM', async () => {
    expect(await codeOf('fixtures/font-obfuscated.epub')).toBe('ok')
  })
})

describe('parseEpub: navigation pages', async () => {
  const book = await parseEpub(load('src/assets/samples/bienvenido-a-spubber.epub'))
  it('does not read the nav document as content', () => {
    expect(book.blocks.some((b) => b.text === 'Table of Contents')).toBe(false)
  })
})
