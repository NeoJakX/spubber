import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const fixture = (n: string) => resolve(process.cwd(), 'fixtures', n)

async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await expect(page.getByText('Todos los libros')).toBeVisible()
  await page.locator('ul li button').first().click()
  await expect(page.getByTestId('stage')).toBeVisible()
}

const progress = (page: Page) => page.locator('#progress').inputValue().then(Number)

test('imports the sample book and shows it in the library', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Tu biblioteca está vacía')).toBeVisible()
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await expect(page.getByText('Bienvenido a Spubber').first()).toBeVisible()
  await expect(page.getByText('Sin empezar')).toBeVisible()
})

test('hold mode reads while the play button is pressed and pauses on release', async ({ page }) => {
  await openSample(page)
  const play = page.getByTestId('play')
  const box = (await play.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(2500)
  const during = await progress(page)
  expect(during).toBeGreaterThan(2)
  await page.mouse.up()
  await page.waitForTimeout(600)
  const after = await progress(page)
  await page.waitForTimeout(600)
  expect(await progress(page)).toBe(after)
  // paused: the paragraph context is visible with the current word highlighted
  await expect(page.locator('.context .w.current')).toBeVisible()
})

test('tap mode toggles reading with the play button', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click()
  await page.getByRole('radio', { name: 'Toque' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('play').click()
  await page.waitForTimeout(2500)
  // While reading, the controls fade out and a tap anywhere pauses.
  await page.mouse.click(200, 300)
  const a = await progress(page)
  expect(a).toBeGreaterThan(1)
  await page.waitForTimeout(500)
  expect(await progress(page)).toBe(a)
})

test('keyboard shortcuts change speed and position', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only')
  await openSample(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('wpm')).toHaveText('350')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('wpm')).toHaveText('325')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await progress(page)).toBe(2)
  await page.keyboard.press('Shift+ArrowRight')
  expect(await progress(page)).toBeGreaterThan(2)
})

test('table of contents jumps to a chapter', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Índice' }).click()
  await page.getByRole('button', { name: /Consejos para entrenar/ }).click()
  await expect(page.locator('header').getByText('Consejos para entrenar')).toBeVisible()
  await expect(page.locator('.context .w.current')).toHaveText('Consejos')
})

test('bookmarks can be added, listed and used to jump', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Índice' }).click()
  await page.getByRole('button', { name: /Un texto para practicar/ }).click()
  const target = await progress(page)
  await page.getByRole('button', { name: 'Marcadores' }).click()
  await page.getByLabel('Nota (opcional)').fill('El faro')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('El faro', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.locator('#progress').fill('0')
  expect(await progress(page)).toBe(0)
  await page.getByRole('button', { name: 'Marcadores' }).click()
  await page.getByText('El faro', { exact: true }).click()
  expect(await progress(page)).toBe(target)
})

test('reading position persists across reloads', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Índice' }).click()
  await page.getByRole('button', { name: /Cómo se usa/ }).click()
  const pos = await progress(page)
  await page.getByRole('button', { name: 'Volver a la biblioteca' }).click()
  await expect(page.getByText('Seguir leyendo')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Seguir leyendo')).toBeVisible()
  await page.getByRole('button', { name: /Bienvenido a Spubber/ }).first().click()
  await expect.poll(() => progress(page)).toBe(pos)
})

test('theme can be switched to sepia and persists', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('radio', { name: /Sepia/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'sepia')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'sepia')
})

test('rejects invalid and DRM-protected files with a clear message', async ({ page }) => {
  await page.goto('/')
  await page.locator('#epub-input').setInputFiles(fixture('not-a-zip.epub'))
  await expect(page.getByText('«not-a-zip.epub» no es un EPUB válido.')).toBeVisible()
  await page.locator('#epub-input').setInputFiles(fixture('drm.epub'))
  await expect(page.getByText(/tiene DRM/)).toBeVisible()
})

test('imports a real EPUB2 file and deletes it', async ({ page }) => {
  await page.goto('/')
  await page.locator('#epub-input').setInputFiles(fixture('quirky-epub2.epub'))
  await expect(page.getByText('Quirky Test Book').first()).toBeVisible()
  await page.getByRole('button', { name: 'Más opciones' }).click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await page.getByRole('button', { name: 'Sí, eliminar' }).click()
  await expect(page.getByText('Tu biblioteca está vacía')).toBeVisible()
})
