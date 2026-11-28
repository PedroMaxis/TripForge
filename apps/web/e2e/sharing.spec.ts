import { randomInt, randomUUID } from 'node:crypto'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { createDb, createTrip } from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

test.beforeEach(({ context }) =>
  context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.1.${randomInt(256)}.${randomInt(1, 255)}` }),
)

async function openSharing(page: Page) {
  const { id } = await signIn(page.context(), 'Pedro')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH com os amigos',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'UTC',
  })
  await db.$client.end()
  await page.goto(`/en/trips/${tripId}/people`)
  return tripId
}

async function createLink(
  page: Page,
  role: 'Can edit, with an account' | 'View only, no account needed',
) {
  await page.getByLabel('People with the link').selectOption({ label: role })
  await page.getByRole('button', { name: 'Create link' }).click()
  const link = page.getByLabel('Invite link')
  await expect(link).toHaveValue(/\/(invite|see)\/[\w-]{40,}$/)
  return link.inputValue()
}

async function guest(browser: Browser, name: string) {
  const context = await browser.newContext({ baseURL: env.APP_URL })
  const { id } = await signIn(context, name)
  return { page: await context.newPage(), id }
}

test('a friend opens the link and joins as an editor', async ({ page, browser }) => {
  const tripId = await openSharing(page)
  const link = await createLink(page, 'Can edit, with an account')
  const ana = await guest(browser, 'Ana')
  await ana.page.goto(link)
  await expect(ana.page.getByText('Pedro invited you to edit')).toBeVisible()
  await ana.page.getByRole('button', { name: 'Join the trip' }).click()
  await expect(ana.page).toHaveURL(new RegExp(`/trips/${tripId}`))
  await expect(ana.page.getByRole('button', { name: 'Add stop' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: 'Ana' })).toBeVisible()
})

test('someone without an account signs up and lands on the invite', async ({ page, browser }) => {
  const tripId = await openSharing(page)
  const link = await createLink(page, 'Can edit, with an account')
  const context = await browser.newContext({
    baseURL: env.APP_URL,
    extraHTTPHeaders: { 'x-forwarded-for': `10.2.${randomInt(256)}.9` },
  })
  const fresh = await context.newPage()
  await fresh.goto(link)
  await expect(fresh.getByRole('heading', { name: 'BH com os amigos' })).toBeVisible()
  await fresh.getByRole('link', { name: 'Create an account' }).click()
  await fresh.getByLabel('Name').fill('Mae')
  await fresh.getByLabel('Email').fill(`${randomUUID()}@example.com`)
  await fresh.getByLabel('Password').fill('correct horse battery')
  await fresh.getByRole('button', { name: 'Create account' }).click()
  await fresh.getByRole('button', { name: 'Join the trip' }).click()
  await expect(fresh).toHaveURL(new RegExp(`/trips/${tripId}`))
  await expect(fresh.getByRole('button', { name: 'Add stop' })).toBeVisible()
})

test('a revoked link stops working', async ({ page, browser }) => {
  await openSharing(page)
  const link = await createLink(page, 'Can edit, with an account')
  await page.getByRole('button', { name: 'Revoke link' }).click()
  await expect(page.getByRole('button', { name: 'Revoke link' })).toHaveCount(0)
  const ana = await guest(browser, 'Ana')
  await ana.page.goto(link)
  await expect(ana.page.getByText('This invite was revoked.')).toBeVisible()
  await expect(ana.page.getByRole('button', { name: 'Join the trip' })).toHaveCount(0)
})

test('a made-up link is not found', async ({ page }) => {
  expect((await page.goto(`/en/invite/${'x'.repeat(43)}`))?.status()).toBe(404)
})

test('the owner changes a role and removes someone', async ({ page, browser }) => {
  const tripId = await openSharing(page)
  const link = await createLink(page, 'Can edit, with an account')
  const ana = await guest(browser, 'Ana')
  await ana.page.goto(link)
  await ana.page.getByRole('button', { name: 'Join the trip' }).click()
  await expect(ana.page).toHaveURL(new RegExp(`/trips/${tripId}`))

  await page.reload()
  await page.getByLabel('Role of Ana').selectOption({ label: 'View only' })
  await expect
    .poll(async () => {
      await ana.page.reload()
      return ana.page.getByRole('button', { name: 'Add stop' }).count()
    })
    .toBe(0)

  await page.getByRole('button', { name: 'Remove Ana' }).click()
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Ana' })).toHaveCount(0)
  expect((await ana.page.reload())?.status()).toBe(404)
  await ana.page.goto(link)
  await expect(ana.page.getByText('This invite was revoked.')).toBeVisible()
})

test('a guest sees the people, manages none, and can leave', async ({ page, browser }) => {
  const tripId = await openSharing(page)
  const link = await createLink(page, 'Can edit, with an account')
  const ana = await guest(browser, 'Ana')
  await ana.page.goto(link)
  await ana.page.getByRole('button', { name: 'Join the trip' }).click()
  await expect(ana.page).toHaveURL(new RegExp(`/trips/${tripId}`))
  await ana.page.goto(`/en/trips/${tripId}/people`)
  await expect(ana.page.getByText('Pedro')).toBeVisible()
  await expect(ana.page.getByRole('button', { name: 'Create link' })).toHaveCount(0)
  await ana.page.getByRole('button', { name: 'Leave trip' }).click()
  await ana.page.getByRole('button', { name: 'Yes, leave' }).click()
  await expect(ana.page).toHaveURL('/en/trips')
  expect((await ana.page.goto(`/en/trips/${tripId}`))?.status()).toBe(404)
})

test('sign-in only ever continues to an invite', async ({ page }) => {
  await signIn(page.context(), 'Ana')
  for (const next of ['https://evil.example', '//evil.example', '/trips/../../x']) {
    await page.goto(`/en/sign-in?next=${encodeURIComponent(next)}`)
    await expect(page).toHaveURL('/en/trips')
  }
})

test('the link goes out on WhatsApp with a message that says what it is', async ({ page }) => {
  await openSharing(page)
  const link = await createLink(page, 'Can edit, with an account')
  const send = page.getByRole('link', { name: 'Send on WhatsApp' })
  const href = new URL((await send.getAttribute('href'))!)
  expect(href.origin).toBe('https://wa.me')
  const text = href.searchParams.get('text')!
  expect(text).toContain('Come plan')
  expect(text).toContain(link)
})
