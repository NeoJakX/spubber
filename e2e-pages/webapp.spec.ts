import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    }
  })
}

test('is installable: manifest, icons and service worker', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('./manifest.webmanifest')
  const manifest = await (await request.get('manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'Spubber', display: 'standalone', start_url: './', scope: './' })
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`)).toEqual(
    expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
  )
  for (const icon of [...manifest.icons, { src: 'icons/apple-touch-icon.png' }]) {
    const r = await request.get(icon.src)
    expect(r.status(), icon.src).toBe(200)
    expect(r.headers()['content-type']).toContain('image/png')
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await waitForServiceWorker(page)
})

test('works offline after the first visit, library included', async ({ page, context }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await expect(page.getByText('Todos los libros')).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Bienvenido a Spubber').first()).toBeVisible()
  await page.locator('ul li button').first().click()
  await expect(page.getByTestId('stage')).toBeVisible()
  await context.setOffline(false)
})

test('iPhone Safari shows the add-to-home-screen steps, and remembers dismissal', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-ES' })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4174/spubber/')
  const banner = page.getByTestId('install-banner')
  await expect(banner).toHaveAttribute('data-kind', 'ios')
  await expect(banner).toContainText('Pulsa Compartir')
  await expect(banner).toContainText('Añadir a pantalla de inicio')
  // The file picker must not filter .epub on iOS (it greys files out).
  expect(await page.locator('#epub-input').getAttribute('accept')).toBeNull()
  await page.getByRole('button', { name: 'Ahora no' }).click()
  await expect(banner).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('install-banner')).toHaveCount(0)
  await ctx.close()
})

test('Android/desktop Chrome: install button uses the browser prompt', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('install-banner')).toHaveCount(0)
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
    e.prompt = async () => {
      ;(window as unknown as { __prompted: boolean }).__prompted = true
    }
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await expect(page.getByTestId('install-banner')).toHaveAttribute('data-kind', 'prompt')
  await page.getByRole('button', { name: 'Instalar' }).click()
  await expect(page.getByTestId('install-banner')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __prompted: boolean }).__prompted)).toBe(true)
})

test('"Share to Spubber" imports an EPUB sent from another app', async ({ page }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  const bytes = [...readFileSync(resolve(process.cwd(), 'fixtures/quirky-epub2.epub'))]
  // Same request the Android share sheet makes (multipart POST to the share_target action).
  await page.evaluate(async (data) => {
    const fd = new FormData()
    fd.append('books', new File([new Uint8Array(data)], 'compartido.epub', { type: 'application/epub+zip' }))
    await fetch('./share-target', { method: 'POST', body: fd })
  }, bytes)
  await page.goto('./?shared=1')
  await expect(page.getByText('Quirky Test Book').first()).toBeVisible()
  await expect(page).toHaveURL(/\/spubber\/$/)
})

test('a new deploy shows "Update" and applies it on tap', async ({ page }) => {
  const { appendFileSync, readFileSync: read, writeFileSync } = await import('node:fs')
  const sw = resolve(process.cwd(), 'dist-pages/sw.js')
  const original = read(sw, 'utf8')
  try {
    await page.goto('./')
    await waitForServiceWorker(page)
    // Simulate a new deploy: the service worker file changes.
    appendFileSync(sw, `\n// deploy ${Date.now()}\n`)
    await page.reload()
    const toast = page.getByText('Hay una versión nueva de Spubber')
    await expect(toast).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Actualizar' }).click()
    await page.waitForLoadState('load')
    await expect(page.getByText('Hay una versión nueva de Spubber')).toHaveCount(0, { timeout: 15_000 })
  } finally {
    writeFileSync(sw, original)
  }
})
