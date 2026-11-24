import { randomUUID } from 'node:crypto'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { createDb, createTrip, tripMembers } from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

const stop = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })
const names = (page: Page) => page.getByTestId('stop-name').allTextContents()
const leg = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Trip days' }).getByRole('button', { name })
const toggle = (page: Page, title: string) =>
  stop(page, title).getByRole('button', { name: new RegExp(`^${title}`) })
const saved = (page: Page) =>
  expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'saved')

async function addStop(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill(title)
  await page.getByLabel('New stop').press('Enter')
  await expect(stop(page, title)).toBeVisible()
  await page.keyboard.press('Escape')
}

/** Pedro's trip, open on both screens. */
async function together(browser: Browser, page: Page, role: 'editor' | 'viewer' = 'editor') {
  const pedro = await signIn(page.context(), 'Pedro')
  const context = await browser.newContext({ baseURL: env.APP_URL })
  const ana = await signIn(context, 'Ana')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, pedro.id, {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'UTC',
  })
  await db.insert(tripMembers).values({ tripId, userId: ana.id, role })
  await db.$client.end()
  const other = await context.newPage()
  await Promise.all([page.goto(`/en/trips/${tripId}`), other.goto(`/en/trips/${tripId}`)])
  for (const p of [page, other])
    await expect(p.locator('[data-online="true"]:visible')).toHaveCount(2)
  return { other, tripId, anaId: ana.id }
}

test('a change reaches the other screen in under a second', async ({ page, browser }) => {
  const { other } = await together(browser, page)
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill('Mercado')
  const start = Date.now()
  await page.getByLabel('New stop').press('Enter')
  await expect(stop(other, 'Mercado')).toBeVisible()
  expect(Date.now() - start).toBeLessThan(1000)
})

test('both see each other, and who is editing what', async ({ page, browser }) => {
  const { other } = await together(browser, page)
  await addStop(page, 'Museu')
  await toggle(other, 'Museu').click()
  await expect(stop(page, 'Museu').getByText('Ana is editing')).toBeVisible()
  await toggle(other, 'Museu').click()
  await expect(stop(page, 'Museu').getByText('Ana is editing')).toHaveCount(0)
  await other.close()
  await expect(page.locator('[data-online="true"]:visible')).toHaveCount(1)
})

test('edits of different fields by both survive', async ({ page, browser }) => {
  const { other } = await together(browser, page)
  await addStop(page, 'Museu')
  await toggle(page, 'Museu').click()
  await toggle(other, 'Museu').click()
  await page.getByLabel('Notes').fill('levar água')
  await other.getByLabel('Starts').fill('09:30')
  await page.getByLabel('Notes').blur()
  await other.getByLabel('Starts').blur()
  for (const p of [page, other]) {
    await expect(p.getByLabel('Notes')).toHaveValue('levar água')
    await expect(p.getByLabel('Starts')).toHaveValue('09:30')
  }
})

test('both moving at once end up with the same order', async ({ page, browser }) => {
  const { other } = await together(browser, page)
  for (const s of ['A1', 'B2', 'C3', 'D4']) await addStop(page, s)
  await expect.poll(() => names(other)).toEqual(['A1', 'B2', 'C3', 'D4'])
  const keyboardMove = async (p: Page, title: string, key: string) => {
    await stop(p, title)
      .getByRole('button', { name: /Reorder/ })
      .focus()
    await p.keyboard.press('Space')
    await p.waitForTimeout(200)
    await p.keyboard.press(key)
    await p.waitForTimeout(300)
    await p.keyboard.press('Space')
  }
  await Promise.all([keyboardMove(page, 'A1', 'ArrowDown'), keyboardMove(other, 'D4', 'ArrowUp')])
  await saved(page)
  await saved(other)
  await expect
    .poll(async () => JSON.stringify(await names(page)) === JSON.stringify(await names(other)))
    .toBe(true)
  expect([...(await names(page))].sort()).toEqual(['A1', 'B2', 'C3', 'D4'])
})

test('an item deleted while open elsewhere is explained and can come back', async ({
  page,
  browser,
}) => {
  const { other } = await together(browser, page)
  await addStop(page, 'Museu')
  await toggle(other, 'Museu').click()
  await toggle(page, 'Museu').click()
  await page.getByRole('button', { name: 'Delete stop' }).click()
  await expect(other.getByText('Pedro deleted Museu')).toBeVisible()
  await other.getByRole('button', { name: 'Undo' }).click()
  for (const p of [page, other]) await expect.poll(() => names(p)).toEqual(['Museu'])
})

test('new dates reach the other screen', async ({ page, browser }) => {
  const { other, tripId } = await together(browser, page)
  await page.goto(`/en/trips/${tripId}/settings`)
  await page.getByLabel('Last day').fill('2027-03-08')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(leg(other, 'Mon')).toBeVisible()
})

test('removing someone takes the trip off their screen at once', async ({ page, browser }) => {
  const { other, tripId } = await together(browser, page)
  await page.goto(`/en/trips/${tripId}/people`)
  await page.getByRole('button', { name: 'Remove Ana' }).click()
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(
    other.getByRole('heading', { name: 'You no longer have access to this trip' }),
  ).toBeVisible()
})

test('becoming a viewer takes the editing away at once', async ({ page, browser }) => {
  const { other, tripId } = await together(browser, page)
  await expect(other.getByRole('button', { name: 'Add stop' })).toBeVisible()
  await page.goto(`/en/trips/${tripId}/people`)
  await page.getByLabel('Role of Ana').selectOption({ label: 'View only' })
  await expect(other.getByText('View only')).toBeVisible()
  await expect(other.getByRole('button', { name: 'Add stop' })).toHaveCount(0)
})

test('what happened while offline arrives on return', async ({ page, browser }) => {
  const { other } = await together(browser, page)
  await other.context().setOffline(true)
  await addStop(page, 'Enquanto isso')
  await saved(page)
  await other.waitForTimeout(300)
  expect(await names(other)).toEqual([])
  await other.context().setOffline(false)
  await expect(stop(other, 'Enquanto isso')).toBeVisible({ timeout: 15_000 })
})

test('an offline edit that clashes shows both versions, and either can stay', async ({
  page,
  browser,
}) => {
  const { other } = await together(browser, page)
  await addStop(page, 'Museu')
  await toggle(other, 'Museu').click()
  await other.context().setOffline(true)
  await other.getByLabel('Name', { exact: true }).fill('Versão da Ana')
  await other.getByLabel('Name', { exact: true }).blur()
  await expect(other.getByTestId('sync')).toHaveAttribute('data-state', 'offline')
  await toggle(page, 'Museu').click()
  await page.getByLabel('Name', { exact: true }).fill('Versão do Pedro')
  await page.getByLabel('Name', { exact: true }).blur()
  await saved(page)
  await other.context().setOffline(false)
  const panel = other.getByRole('region', { name: /Conflict in/ })
  await expect(panel).toBeVisible({ timeout: 15_000 })
  await expect(panel).toContainText('Versão da Ana')
  await expect(panel).toContainText('Versão do Pedro')
  await panel.getByRole('button', { name: 'Use mine' }).click()
  await expect(panel).toHaveCount(0)
  for (const p of [page, other])
    await expect(p.getByTestId('stop-name')).toHaveText('Versão da Ana')
})

test('unsent changes survive closing the page', async ({ page }) => {
  const { id } = await signIn(page.context(), 'Pedro')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'UTC',
  })
  await db.$client.end()
  await page.goto(`/en/trips/${tripId}`)
  await page.route('**/operations', (r) => r.abort())
  await addStop(page, 'Guardado')
  await expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'offline')
  const context = page.context()
  await page.close({ runBeforeUnload: false })
  const again = await context.newPage()
  await again.goto(`/en/trips/${tripId}`)
  await expect(stop(again, 'Guardado')).toBeVisible()
  await saved(again)
  await again.reload()
  await expect(stop(again, 'Guardado')).toHaveCount(1)
})

test('a session that ends keeps the changes for after signing in', async ({ page }) => {
  const { id } = await signIn(page.context(), 'Pedro')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'UTC',
  })
  await db.$client.end()
  await page.goto(`/en/trips/${tripId}`)
  await expect(page.locator('[data-online="true"]:visible')).toHaveCount(1)
  const cookies = await page.context().cookies()
  await page.context().clearCookies()
  await addStop(page, 'Guardado')
  await expect(page.getByText('Your session ended.')).toBeVisible()
  await page.context().addCookies(cookies)
  page.on('dialog', (d) => d.accept())
  await page.reload()
  await expect(stop(page, 'Guardado')).toBeVisible()
  await saved(page)
})

test('the history tells who did what, and can be narrowed to a day', async ({ page, browser }) => {
  const { other, tripId } = await together(browser, page)
  await addStop(page, 'Museu')
  await toggle(other, 'Museu').click()
  await other.getByLabel('Move to').selectOption({ label: 'Friday, March 5' })
  await saved(other)
  await page.goto(`/en/trips/${tripId}/history`)
  await expect(page.getByText('Pedro added Museu')).toBeVisible()
  await expect(page.getByText('Ana moved Museu to Day 2')).toBeVisible()
  await page.getByLabel('Day').selectOption({ label: 'Day 2' })
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(page.getByText('Ana moved Museu to Day 2')).toBeVisible()
  await expect(page.getByText('Pedro added Museu')).toHaveCount(0)
})

test('a viewer watches the changes live', async ({ page, browser }) => {
  const { other } = await together(browser, page, 'viewer')
  await addStop(page, 'Ao vivo')
  await expect(stop(other, 'Ao vivo')).toBeVisible()
})

test('the log is closed to strangers', async ({ page, browser, request }) => {
  const { tripId } = await together(browser, page)
  const outside = await browser.newContext()
  await signIn(outside, 'Estranho')
  expect((await request.get(`/api/trips/${tripId}/log?since=0`)).status()).toBe(401)
  expect(
    (await outside.request.get(`${env.APP_URL}/api/trips/${tripId}/log?since=0`)).status(),
  ).toBe(404)
  expect((await page.request.get(`/api/trips/${tripId}/log?since=x`)).status()).toBe(400)
  expect(
    (await outside.request.get(`${env.APP_URL}/en/trips/${randomUUID()}/history`)).status(),
  ).toBe(404)
})
