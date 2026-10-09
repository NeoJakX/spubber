import { expect, test } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Build a ~300k-word EPUB (about the size of a long novel) in memory. */
function bigEpub(chapters = 150, paragraphs = 40, words = 50) {
  const vocab = 'el la de que y a en un ser se no haber por con su para como estar tener le lo todo pero más hacer o poder decir este ir otro ese si me ya ver porque dar cuando muy sin vez mucho saber qué sobre mi alguno mismo yo también hasta año dos querer entre así primero desde grande eso ni nos llegar pasar tiempo ella sí día uno bien poco deber entonces poner cosa tanto hombre parecer nuestro tan donde ahora parte después vida quedar siempre creer hablar llevar dejar nada cada seguir menos nuevo encontrar'.split(' ')
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  }
  const items: string[] = []
  const refs: string[] = []
  const nav: string[] = []
  for (let c = 0; c < chapters; c++) {
    const ps: string[] = [`<h1>Capítulo ${c + 1}</h1>`]
    for (let p = 0; p < paragraphs; p++) {
      const ws: string[] = []
      for (let w = 0; w < words; w++) ws.push(vocab[Math.floor(rnd() * vocab.length)] + (w % 12 === 11 ? '.' : w % 5 === 4 ? ',' : ''))
      ps.push(`<p>${ws.join(' ')}.</p>`)
    }
    files[`OEBPS/c${c}.xhtml`] = strToU8(`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>c</title></head><body>${ps.join('')}</body></html>`)
    items.push(`<item id="c${c}" href="c${c}.xhtml" media-type="application/xhtml+xml"/>`)
    refs.push(`<itemref idref="c${c}"/>`)
    nav.push(`<li><a href="c${c}.xhtml">Capítulo ${c + 1}</a></li>`)
  }
  files['OEBPS/nav.xhtml'] = strToU8(`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${nav.join('')}</ol></nav></body></html>`)
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Libro enorme</dc:title><dc:creator>Prueba</dc:creator><dc:language>es</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>${items.join('')}</manifest><spine>${refs.join('')}</spine></package>`)
  return zipSync(files)
}

test('imports a 300k-word book quickly and keeps an exact pace at 1000 wpm', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop timing only')
  test.setTimeout(90_000)
  const dir = mkdtempSync(join(tmpdir(), 'spubber-'))
  const file = join(dir, 'enorme.epub')
  writeFileSync(file, bigEpub())

  await page.goto('/')
  const t0 = Date.now()
  await page.locator('#epub-input').setInputFiles(file)
  await expect(page.getByText('Libro enorme').first()).toBeVisible({ timeout: 60_000 })
  const importMs = Date.now() - t0
  console.log(`import: ${importMs} ms`)
  expect(importMs).toBeLessThan(20_000)

  const t1 = Date.now()
  await page.locator('ul li button').first().click()
  await expect(page.getByTestId('stage')).toBeVisible()
  await expect(page.locator('#progress')).toHaveAttribute('max', /\d{6}/)
  console.log(`open: ${Date.now() - t1} ms`)

  // Flat timing so the expected count is exact: disable natural pauses, max speed.
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click()
  await page.getByRole('switch', { name: 'Pausas naturales' }).click()
  await page.getByRole('radio', { name: 'Toque' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  for (let i = 0; i < 28; i++) await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('wpm')).toHaveText('1000')

  const start = Number(await page.locator('#progress').inputValue())
  await page.keyboard.press(' ')
  await page.waitForTimeout(6000)
  await page.keyboard.press(' ')
  const read = Number(await page.locator('#progress').inputValue()) - start
  console.log(`words in 6 s at 1000 wpm: ${read}`)
  // 100 expected (minus ~1 for the start ramp); allow a little slack for the test harness itself.
  expect(read).toBeGreaterThanOrEqual(95)
  expect(read).toBeLessThanOrEqual(101)
})
