import { expect, test } from '@playwright/test'
import { verifyRealtimeToken } from '@tripforge/core'
import { env } from './env'
import { signIn } from './session'

test('health check confirms the database is reachable', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok' })
})

test.describe('languages', () => {
  test.describe('Brazilian browser', () => {
    test.use({ locale: 'pt-BR' })
    test('opens in Portuguese', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL('/pt-BR')
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
      await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    })
  })

  test('any other browser opens in English, and can switch', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/en')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await page.getByRole('link', { name: 'Português' }).click()
    await expect(page).toHaveURL('/pt-BR')
    await page.goto('/')
    await expect(page).toHaveURL('/pt-BR')
  })

  test('an unknown language is a 404', async ({ request }) => {
    expect((await request.get('/xx/trips')).status()).toBe(404)
  })
})

test.describe('signed out', () => {
  test('the trips page sends you to the landing page', async ({ page }) => {
    await page.goto('/pt-BR/trips')
    await expect(page).toHaveURL('/pt-BR')
  })

  test('cannot get a realtime token', async ({ request }) => {
    expect((await request.get('/api/realtime-token')).status()).toBe(401)
  })
})

test.describe('signed in', () => {
  test('the landing page goes straight to trips', async ({ page, context }) => {
    await signIn(context, 'Ana')
    await page.goto('/en')
    await expect(page).toHaveURL('/en/trips')
    await expect(page.getByText('Ana')).toBeVisible()
    await expect(page.getByText('No trips yet')).toBeVisible()
  })

  test('gets a realtime token for themselves, never cached', async ({ context }) => {
    const { id } = await signIn(context, 'Ana')
    const res = await context.request.get('/api/realtime-token')
    expect(res.headers()['cache-control']).toContain('no-store')
    const { token } = await res.json()
    const verified = await verifyRealtimeToken(token, { secret: env.REALTIME_SECRET })
    expect(verified).toMatchObject({ userId: id, name: 'Ana' })
  })

  test('signing out ends the session', async ({ page, context }) => {
    await signIn(context, 'Ana')
    await page.goto('/en/trips')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/en')
    await page.goto('/en/trips')
    await expect(page).toHaveURL('/en')
  })
})
