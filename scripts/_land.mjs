import { chromium } from '@playwright/test'
const out = process.argv[2] ?? 'before'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [name, vp] of [['land', { width: 844, height: 390 }], ['land-se', { width: 667, height: 375 }], ['portrait', { width: 390, height: 844 }], ['desk', { width: 1200, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'es-ES', hasTouch: vp.width < 900, isMobile: vp.width < 900 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/')
  await page.evaluate(() => localStorage.setItem('spubber.settings', JSON.stringify({ state: { theme: 'sepia' }, version: 1 })))
  await page.reload()
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await page.locator('ul li button').first().click()
  await page.locator('#progress').fill('120')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `/tmp/claude-0/shots/${out}-${name}.png` })
  await ctx.close()
}
await browser.close()
