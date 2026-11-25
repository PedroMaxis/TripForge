import { expect, type Page, test } from '@playwright/test'

const scene = (page: Page) => page.getByTestId('scene')
const texts = [
  'Plan the trip together',
  'Every stop in its place',
  'The way, by street',
  'Everyone together, live',
]

test('says what it is and where to go', async ({ page }) => {
  await page.goto('/en')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Plan the trip together' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create an account' }).first()).toHaveAttribute(
    'href',
    '/en/sign-up',
  )
  await page.getByRole('link', { name: 'Sign in' }).first().click()
  await expect(page).toHaveURL('/en/sign-in')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('the relief is drawn, follows the scroll and rests when out of sight', async ({ page }) => {
  // Without a graphics card, as in CI, every picture of the scene takes seconds.
  test.slow()
  await page.goto('/en')
  await expect(scene(page)).toHaveAttribute('data-scene', 'ready', { timeout: 20_000 })
  const first = await page.locator('canvas').screenshot()
  await page.evaluate(() => scrollTo(0, innerHeight * 2.4))
  await expect(page.getByRole('heading', { name: 'The way, by street' })).toBeInViewport()
  await expect
    .poll(async () => (await page.locator('canvas').screenshot()).equals(first), {
      timeout: 30_000,
    })
    .toBe(false)
  await page.getByRole('heading', { name: 'Start with your next trip' }).scrollIntoViewIfNeeded()
  await expect(scene(page)).toHaveAttribute('data-running', 'false')
})

test('every text is there for who reads without seeing the scene', async ({ page }) => {
  await page.goto('/en')
  for (const name of texts) await expect(page.getByRole('heading', { name })).toBeAttached()
})

for (const [why, options, script] of [
  [
    'without WebGL',
    {},
    () => {
      HTMLCanvasElement.prototype.getContext = () => null
    },
  ],
  ['with reduced motion', { reducedMotion: 'reduce' as const }, () => {}],
] as const) {
  test(`${why}, the page is whole and still`, async ({ browser, baseURL }) => {
    const page = await (await browser.newContext({ ...options, baseURL })).newPage()
    await page.addInitScript(script)
    await page.goto('/en')
    await expect(scene(page)).toHaveAttribute('data-scene', 'off')
    for (const name of texts) {
      const heading = page.getByRole('heading', { name })
      await heading.scrollIntoViewIfNeeded()
      await expect(heading).toBeInViewport()
      await expect(heading).toHaveCSS('opacity', '1')
    }
    await page.context().close()
  })
}

test('without JavaScript every text and link is still there', async ({ browser, baseURL }) => {
  const page = await (await browser.newContext({ javaScriptEnabled: false, baseURL })).newPage()
  await page.goto('/en')
  for (const name of texts) await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create an account' }).first()).toBeVisible()
  await page.context().close()
})

test('fits the screen and credits its sources', async ({ page }) => {
  await page.goto('/pt-BR')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0)
  const footer = page.getByRole('contentinfo')
  for (const who of ['OpenStreetMap', 'OSRM', 'NASA SRTM']) await expect(footer).toContainText(who)
})

test('nothing on it fails to load', async ({ page }) => {
  const bad: string[] = []
  page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`))
  page.on('pageerror', (e) => bad.push(e.message))
  await page.goto('/en')
  await expect(scene(page)).toHaveAttribute('data-scene', 'ready', { timeout: 20_000 })
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  expect(bad).toEqual([])
})
