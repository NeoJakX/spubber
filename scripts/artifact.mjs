// Turn dist-single/index.html into an Artifact page body (no doctype/html/head/body wrappers).
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('dist-single/index.html', 'utf8')
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
const title = '<title>Spubber</title>'
const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n')
const scripts = [...head.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n')
const out = `${title}\n<meta name="description" content="Spubber: lectura rápida para tus EPUB">\n${styles}\n${body.trim()}\n${scripts}\n`
const dest = process.argv[2] ?? 'dist-single/spubber-artifact.html'
writeFileSync(dest, out)
console.log(`wrote ${dest} (${(out.length / 1024).toFixed(0)} KB)`)
