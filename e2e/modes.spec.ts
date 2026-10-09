import { expect, test, type Page } from '@playwright/test'

async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /libro de ejemplo/i }).click()
  await expect(page.getByText('Todos los libros')).toBeVisible()
  await page.locator('ul li button').first().click()
  await expect(page.getByTestId('stage')).toBeVisible()
}
async function setMode(page: Page, label: string) {
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click()
  await page.getByRole('radio', { name: label }).click()
  await page.getByRole('button', { name: 'Close' }).click()
}
const progress = (page: Page) => page.locator('#progress').inputValue().then(Number)
async function stageBox(page: Page) {
  return (await page.getByTestId('stage').boundingBox())!
}

test('scroll mode: wheel and drag move word by word', async ({ page, isMobile }) => {
  await openSample(page)
  await setMode(page, 'Scroll')
  const b = await stageBox(page)
  const x = b.x + b.width / 2
  if (!isMobile) {
    await page.mouse.move(x, b.y + 80)
    await page.mouse.wheel(0, 400) // 40 px per word
    await expect.poll(() => progress(page)).toBe(10)
    await page.mouse.wheel(0, -120)
    await expect.poll(() => progress(page)).toBe(7)
  }
  // Drag up = forward (18 px per word), released slowly so there is no inertia.
  const before = await progress(page)
  await page.mouse.move(x, b.y + 200)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x, b.y + 200 - i * 18)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
  await page.mouse.up()
  const after = await progress(page)
  expect(after - before).toBeGreaterThanOrEqual(9)
  expect(after - before).toBeLessThanOrEqual(11)
})

test('gesture mode: right side reads faster, flicks jump sentences', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Índice' }).click()
  await page.getByRole('button', { name: /Leer sin mover los ojos/ }).click()
  await setMode(page, 'Gestos')
  const b = await stageBox(page)

  // Hold at the right edge: ×2 speed
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('gesture-rate')).toHaveText(/×(1\.9\d|2\.00) · (5[89]\d|600)/)
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(page.getByTestId('gesture-rate')).toHaveCount(0)

  // Hold in the centre: base speed
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('gesture-rate')).toContainText('×1.00')
  // Slide left while holding: slower
  await page.mouse.move(b.x + 2, b.y + b.height / 2, { steps: 5 })
  await expect(page.getByTestId('gesture-rate')).toHaveText(/×0\.5\d · 1[45]\d/)
  await page.mouse.up()

  // Flick up: next sentence (without reading words in between)
  const start = await progress(page)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 120, { steps: 3 })
  await page.mouse.up()
  const afterUp = await progress(page)
  expect(afterUp).toBeGreaterThan(start)
  // Flick down: back
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + 120, { steps: 3 })
  await page.mouse.up()
  expect(await progress(page)).toBeLessThan(afterUp)
})

test('the hint retires after a few reading sessions', async ({ page }) => {
  await openSample(page)
  await expect(page.getByTestId('hint')).not.toBeEmpty()
  await page.keyboard.down(' ')
  await page.waitForTimeout(300)
  await page.keyboard.up(' ')
  const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('spubber.settings')!).state.hintCounts)
  expect(counts.hold).toBe(1)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('spubber.settings')!)
    raw.state.hintCounts = { hold: 3 }
    localStorage.setItem('spubber.settings', JSON.stringify(raw))
  })
  await page.reload()
  await page.locator('ul li button').first().click()
  await expect(page.getByTestId('stage')).toBeVisible()
  await expect(page.getByTestId('hint')).toBeEmpty()
})

test('vibration ticks once per word on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only')
  await page.addInitScript(() => {
    ;(window as unknown as { __vib: number }).__vib = 0
    navigator.vibrate = () => {
      ;(window as unknown as { __vib: number }).__vib++
      return true
    }
  })
  await openSample(page)
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click()
  await page.getByRole('switch', { name: 'Vibración por palabra' }).click()
  await page.getByRole('switch', { name: 'Sonido de página' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await setMode(page, 'Scroll')
  const b = await stageBox(page)
  await page.mouse.move(b.x + b.width / 2, b.y + 200)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(b.x + b.width / 2, b.y + 200 - i * 18)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
  await page.mouse.up()
  const words = await progress(page)
  const vib = await page.evaluate(() => (window as unknown as { __vib: number }).__vib)
  expect(vib).toBe(words)
})

test('haptics option is hidden on desktop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only')
  await openSample(page)
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click()
  await expect(page.getByRole('switch', { name: 'Sonido de página' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Vibración por palabra' })).toHaveCount(0)
})
