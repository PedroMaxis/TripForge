import { randomUUID } from 'node:crypto'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { clockIn, type Operation, shiftDate } from '@tripforge/core'
import { applyOperation, createDb, createInvite, createTrip, getTrip } from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

const timezone = 'America/Sao_Paulo'
const today = () => clockIn(timezone).date

/** A trip that is on right now: today has four stops, out of their shortest order. */
async function makeTrip(page: Page) {
  const { id } = await signIn(page.context(), 'Pedro')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH com os amigos',
    destination: 'Belo Horizonte',
    destinationLat: -19.92,
    destinationLng: -43.94,
    startDate: shiftDate(today(), -1),
    endDate: shiftDate(today(), 1),
    timezone,
  })
  const days = (await getTrip(db, id, tripId))!.days
  const apply = (op: Operation) =>
    applyOperation(db, { userId: id, tripId, opId: randomUUID(), op })
  const stops = [
    ['Casa do Baile', -43.97],
    ['Mineirão', -43.91],
    ['Casa Kubitschek', -43.96],
    ['Mercado Central', -43.94],
  ] as const
  const ids: string[] = []
  for (const [i, [title, lng]] of stops.entries()) {
    const itemId = randomUUID()
    ids.push(itemId)
    await apply({
      type: 'item.create',
      itemId,
      dayId: days[1]!.id,
      position: `a${i}`,
      title,
      kind: 'activity',
      place: { placeName: title, address: `Rua ${i}`, lat: -19.85, lng, osmRef: null },
    })
  }
  const invite = await createInvite(db, id, tripId, 'viewer')
  await db.$client.end()
  return { tripId, ids, token: invite.token }
}
const stranger = async (browser: Browser) =>
  (await browser.newContext({ baseURL: env.APP_URL })).newPage()
const next = (page: Page) => page.getByRole('region', { name: 'Today' })
const names = (page: Page) => page.getByTestId('stop-name').allInnerTexts()

test('shows the next stop, the way there, and what is done, also without an account', async ({
  page,
  browser,
}) => {
  const { tripId, token } = await makeTrip(page)
  const mom = await stranger(browser)
  await mom.goto(`/en/see/${token}`)
  await page.goto(`/en/trips/${tripId}`)
  await expect(next(page)).toContainText('Casa do Baile')
  await expect(next(mom)).toContainText('Casa do Baile')
  await expect(next(page).getByRole('link', { name: 'Go with Google Maps' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=-19.85,-43.97',
  )
  await expect(next(mom).getByRole('link', { name: 'Go with Waze' })).toHaveAttribute(
    'href',
    'https://www.waze.com/ul?ll=-19.85,-43.97&navigate=yes',
  )
  await expect(next(mom).getByRole('button', { name: "We've been here" })).toHaveCount(0)

  await next(page).getByRole('button', { name: "We've been here" }).click()
  await expect(next(page)).toContainText('Mineirão')
  await expect(page.getByRole('listitem').filter({ hasText: 'Casa do Baile' })).toContainText(
    'done',
  )
  await expect(next(mom)).toContainText('Mineirão', { timeout: 15_000 })

  await page.getByTestId('stop-name').first().click()
  await page.getByRole('button', { name: 'Not yet, after all' }).click()
  await expect(next(page)).toContainText('Casa do Baile')
})

test('shows the weather of each day', async ({ page, browser }) => {
  const { tripId, token } = await makeTrip(page)
  await page.goto(`/en/trips/${tripId}`)
  await expect(page.getByTestId('weather')).toContainText('Rain, 18 to 27 °C')
  const mom = await stranger(browser)
  await mom.goto(`/pt-BR/see/${token}`)
  await expect(mom.getByTestId('weather')).toContainText('Chuva, 18 a 27 °C')
})

test('puts a day in its shortest order, and back', async ({ page }) => {
  const { tripId } = await makeTrip(page)
  await page.goto(`/en/trips/${tripId}`)
  const before = ['Casa do Baile', 'Mineirão', 'Casa Kubitschek', 'Mercado Central']
  await expect.poll(() => names(page)).toEqual(before)
  await page.getByRole('button', { name: /Shorten the way by about \d/ }).click()
  const after = ['Casa do Baile', 'Casa Kubitschek', 'Mercado Central', 'Mineirão']
  await expect.poll(() => names(page)).toEqual(after)
  await expect(page.getByRole('button', { name: /Shorten/ })).toHaveCount(0)
  await expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'saved')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => names(page)).toEqual(before)
  await expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'saved')
  await page.goto(`/en/trips/${tripId}/history`)
  await expect(page.getByText('Pedro put Day 2 in a new order').first()).toBeVisible()
})

test('goes to a calendar and to paper, with or without an account', async ({ page, browser }) => {
  const { tripId, token } = await makeTrip(page)
  await page.goto(`/en/trips/${tripId}`)
  await page.getByRole('button', { name: 'More' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Add to a calendar' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('BH com os amigos.ics')

  const mom = await stranger(browser)
  await mom.goto(`/en/see/${token}`)
  const calendar = await mom.request.get(`/api/see/${token}/calendar`)
  expect(calendar.headers()['content-type']).toBe('text/calendar; charset=utf-8')
  expect(await calendar.text()).toContain('SUMMARY:Casa do Baile')
  await mom.getByRole('link', { name: 'Print' }).click()
  await expect(mom.getByRole('heading', { name: 'BH com os amigos' })).toBeVisible()
  await expect(mom.getByRole('listitem')).toHaveCount(4)
  await expect(mom.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()
  await mom.emulateMedia({ media: 'print' })
  await expect(mom.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden()
  await mom.emulateMedia({ media: 'screen' })
  await mom.getByRole('link', { name: 'Back to the trip' }).click()
  await expect(next(mom)).toBeVisible()
  await expect(mom.getByRole('link', { name: 'Duplicate' })).toHaveCount(0)
  expect((await mom.request.get(`/api/trips/${tripId}/calendar`)).status()).toBe(401)
  expect((await mom.request.get(`/api/trips/${tripId}/weather`)).status()).toBe(401)
  await mom.goto(`/en/trips/${tripId}/print`)
  await expect(mom).toHaveURL(/sign-in/)
  expect((await mom.goto(`/en/see/${'x'.repeat(43)}/print`))?.status()).toBe(404)
})

test('makes a copy of a trip on other dates', async ({ page }) => {
  const { tripId } = await makeTrip(page)
  await page.goto(`/en/trips/${tripId}`)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Duplicate' }).click()
  await page.getByLabel('Trip name').fill('BH no inverno')
  await page.getByLabel('First day').fill('2031-07-01')
  await page.getByRole('button', { name: 'Create the copy' }).click()
  await expect(page.getByRole('heading', { name: 'BH no inverno' })).toBeVisible()
  await expect(page).not.toHaveURL(new RegExp(tripId))
  await expect(page.getByText('July 1 – 3, 2031')).toBeVisible()
  await page.getByRole('navigation', { name: 'Trip days' }).getByText('Day 2').click()
  await expect.poll(() => names(page)).toHaveLength(4)
})

test('the sections of a trip are one tap away, and More closes by itself', async ({ page }) => {
  const { tripId } = await makeTrip(page)
  await page.goto(`/en/trips/${tripId}`)
  const nav = page.getByRole('navigation', { name: 'Trip sections' })
  await expect(nav.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('button', { name: 'More' }).click()
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeHidden()
  await nav.getByRole('link', { name: 'People' }).click()
  await expect(page).toHaveURL(/\/people$/)
  await expect(
    page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'People' }),
  ).toHaveAttribute('aria-current', 'page')
})
