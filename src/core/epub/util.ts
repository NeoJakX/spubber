/** Directory part of a zip path ("OEBPS/text/ch1.xhtml" -> "OEBPS/text/"). */
export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}

/**
 * Resolve an href found in `basePath` to a normalised zip path.
 * Strips the fragment, decodes %-escapes and collapses "." / "..".
 */
export function resolvePath(basePath: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0]
  let decoded = clean
  try {
    decoded = decodeURIComponent(clean)
  } catch {
    /* keep raw */
  }
  const joined = decoded.startsWith('/') ? decoded.slice(1) : dirname(basePath) + decoded
  const out: string[] = []
  for (const part of joined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** Fragment of an href without the '#', or '' if none. */
export function fragmentOf(href: string): string {
  const i = href.indexOf('#')
  if (i === -1) return ''
  try {
    return decodeURIComponent(href.slice(i + 1))
  } catch {
    return href.slice(i + 1)
  }
}

/** Decode bytes honouring BOMs and XML / HTML encoding declarations. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))

  // Sniff the first bytes as latin1 to find a declared encoding.
  let head = ''
  const n = Math.min(bytes.length, 1024)
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i])
  const m =
    /<\?xml[^>]*encoding=["']([\w.:-]+)["']/i.exec(head) ??
    /<meta[^>]*charset=["']?([\w.:-]+)/i.exec(head)
  const label = m?.[1]?.toLowerCase()
  if (label && label !== 'utf-8' && label !== 'utf8') {
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      /* unknown label, fall through to utf-8 */
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function hasParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0
}

/** Parse an XML document (OPF, NCX, container). Returns null when unparseable. */
export function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  return hasParserError(doc) ? null : doc
}

/**
 * Parse an XHTML content document. Falls back to the forgiving HTML parser
 * when the document is not well-formed XML (undeclared entities, unclosed tags…),
 * which is common in real-world EPUBs.
 */
export function parseXhtml(text: string): Document {
  const xml = new DOMParser().parseFromString(text, 'application/xhtml+xml')
  if (!hasParserError(xml)) return xml
  return new DOMParser().parseFromString(text, 'text/html')
}

/** All descendant elements with the given local name, ignoring namespaces/prefixes. */
export function byLocalName(root: Document | Element, name: string): Element[] {
  const out: Element[] = []
  const all = root.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    if (localName(all[i]) === name) out.push(all[i])
  }
  return out
}

export function localName(el: Element): string {
  return (el.localName || el.nodeName).toLowerCase().replace(/^.*:/, '')
}

/** Read an attribute regardless of its namespace prefix (e.g. epub:type, opf:role). */
export function attr(el: Element, name: string): string | null {
  const direct = el.getAttribute(name)
  if (direct !== null) return direct
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    if (a.localName === name || a.name.endsWith(':' + name)) return a.value
  }
  return null
}

/** Collapse whitespace and drop invisible characters. */
export function normalizeText(s: string): string {
  return s
    .replace(/[­​-‍⁠﻿]/g, '')
    .replace(/[\s  -   　]+/g, ' ')
    .trim()
}
