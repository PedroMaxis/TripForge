import { expect, type Page, test } from '@playwright/test'
import { createDb, createTrip, trips } from '@tripforge/db'
import { eq } from 'drizzle-orm'
import { env } from './env'
import { signIn } from './session'

test('can be installed: manifest, icons and theme', async ({ page, request }) => {
  await page.goto('/en')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'TripForge', display: 'standalone', start_url: '/' })
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
  }
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /.+/)
  const icon = await page.locator('link[rel="icon"]').first().getAttribute('href')
  expect((await request.get(icon!)).status()).toBe(200)
  expect((await request.get('/favicon.ico')).status()).toBe(200)
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect((await request.get(apple!)).status()).toBe(200)
})

test('without connection, says so instead of the browser error, and comes back', async ({
  page,
  context,
}) => {
  await page.goto('/pt-BR')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.goto('/pt-BR/sign-up')
  await expect(page.getByText('Sem conexão')).toBeVisible()
  // It notices by itself that the connection is back.
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible({
    timeout: 15_000,
  })
})

test('keeps trying when the connection says it is back but is not quite', async ({
  page,
  context,
}) => {
  await page.goto('/pt-BR')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.goto('/pt-BR/sign-up')
  await expect(page.getByText('Sem conexão')).toBeVisible()
  // Back, as far as the browser knows, while the first answer still fails.
  let failures = 0
  await context.route('**/api/health', (route) =>
    failures++ < 1 ? route.abort() : route.continue(),
  )
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible({
    timeout: 15_000,
  })
  expect(failures).toBeGreaterThan(1)
})

const keptPaths = (page: Page) =>
  page.evaluate(async () => {
    const names = await caches.keys()
    const all = await Promise.all(
      names.map(async (n) =>
        (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname),
      ),
    )
    return all.flat().filter((p) => !p.startsWith('/_next/static/') && p !== '/offline.html')
  })

test('a trip opened once can be read without connection, until sign-out', async ({
  page,
  context,
}) => {
  const { id } = await signIn(context, 'Ana')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH sem sinal',
    destination: 'Belo Horizonte',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'America/Sao_Paulo',
  })
  await db.$client.end()
  await page.goto(`/en/trips/${tripId}`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'BH sem sinal' })).toBeVisible()
  await page.goto('/en/account')
  // Only the trip itself is kept: not the account, the list of trips or anything else.
  expect(await keptPaths(page)).toEqual([`/en/trips/${tripId}`])

  await context.setOffline(true)
  await page.goto(`/en/trips/${tripId}`)
  await expect(page.getByRole('heading', { name: 'BH sem sinal' })).toBeVisible()
  await page.goto('/en/trips')
  await expect(page.getByText('No connection')).toBeVisible()
  await page.getByRole('link', { name: 'BH sem sinal' }).click()
  await expect(page.getByRole('heading', { name: 'BH sem sinal' })).toBeVisible()

  await context.setOffline(false)
  await page.goto('/en/trips')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/en$/)
  expect(await keptPaths(page)).toEqual([])
})

test('a trip that cannot be opened any more is not kept', async ({ page, context }) => {
  const { id } = await signIn(context, 'Ana')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'Some',
    destination: 'Belo Horizonte',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'America/Sao_Paulo',
  })
  await page.goto(`/en/trips/${tripId}`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => keptPaths(page)).toEqual([`/en/trips/${tripId}`])
  await db.delete(trips).where(eq(trips.id, tripId))
  await db.$client.end()
  await page.reload()
  expect(await keptPaths(page)).toEqual([])
})
