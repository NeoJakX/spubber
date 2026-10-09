// Quick visual check: node scripts/shots.mjs [url] [outdir]
import { chromium } from '@playwright/test'
const url = process.argv[2] ?? 'http://localhost:4173/'
const out = process.argv[3] ?? '/tmp/claude-0/shots'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch())
const errors = []
async function run(name, viewport, scheme, fn) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, locale: 'es-ES', hasTouch: viewport.width < 600 })
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  await page.goto(url)
  await fn(page)
  await ctx.close()
}
const shot = (page, n) => page.screenshot({ path: `${out}/${n}.png` })

await run('desktop', { width: 1280, height: 800 }, 'light', async (page) => {
  await page.waitForTimeout(600)
  await shot(page, '01-empty-desktop')
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await page.waitForTimeout(800)
  await shot(page, '02-library-desktop')
  await page.locator('ul li button').first().click()
  await page.waitForTimeout(600)
  await shot(page, '03-reader-paused-desktop')
  await page.keyboard.down(' ')
  await page.waitForTimeout(1500)
  await shot(page, '04-reader-playing-desktop')
  await page.keyboard.up(' ')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Índice' }).click()
  await page.waitForTimeout(300)
  await shot(page, '05-toc-desktop')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click()
  await page.waitForTimeout(300)
  await shot(page, '06-settings-desktop')
})

await run('mobile', { width: 390, height: 844 }, 'dark', async (page) => {
  await page.waitForTimeout(500)
  await shot(page, '07-empty-mobile-dark')
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await page.waitForTimeout(800)
  await shot(page, '08-library-mobile-dark')
  await page.locator('ul li button').first().click()
  await page.waitForTimeout(600)
  await shot(page, '09-reader-mobile-dark')
  await page.getByRole('button', { name: 'Marcadores' }).click()
  await page.waitForTimeout(300)
  await shot(page, '10-bookmarks-mobile-dark')
})

console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()
