import { expect, test } from '@playwright/test'
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
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
})

test('the service worker keeps no private page or answer', async ({ page, context }) => {
  await signIn(context, 'Ana')
  await page.goto('/en/trips')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  const kept = await page.evaluate(async () => {
    const names = await caches.keys()
    const all = await Promise.all(
      names.map(async (n) =>
        (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname),
      ),
    )
    return all.flat()
  })
  expect(kept.filter((p) => !p.startsWith('/_next/static/') && p !== '/offline.html')).toEqual([])
})
