import { randomUUID } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { createDb, createTrip, tripMembers } from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

const input = {
  title: 'BH com os amigos',
  destination: 'Belo Horizonte',
  startDate: '2027-03-04',
  endDate: '2027-03-06',
  timezone: 'America/Sao_Paulo',
}

async function seed(ownerId: string, others: { userId: string; role: 'editor' | 'viewer' }[] = []) {
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, ownerId, input)
  if (others.length) await db.insert(tripMembers).values(others.map((o) => ({ ...o, tripId })))
  await db.$client.end()
  return tripId
}

async function openTrip(page: Page) {
  const { id } = await signIn(page.context(), 'Ana')
  const tripId = await seed(id)
  await page.goto(`/en/trips/${tripId}`)
  return tripId
}

async function addStop(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill(title)
  await page.getByLabel('New stop').press('Enter')
  await expect(stop(page, title)).toBeVisible()
  await page.keyboard.press('Escape')
}

const stop = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })
const names = (page: Page) => page.getByTestId('stop-name').allTextContents()
const leg = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Trip days' }).getByRole('button', { name })
/** Waits until every change reached the server. */
const saved = (page: Page) =>
  expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'saved')

async function drag(page: Page, title: string, to: { x: number; y: number }) {
  const box = (await stop(page, title)
    .getByRole('button', { name: /Reorder/ })
    .boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 20 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  // dnd-kit ignores clicks for a moment after a drop, so a drop never clicks what is under it.
  await page.waitForTimeout(100)
}
const center = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
})

test('creates a trip and finds it in the list', async ({ page, context }) => {
  await signIn(context, 'Ana')
  await page.goto('/en/trips')
  await page.getByRole('link', { name: 'New trip' }).first().click()
  await page.getByLabel('Trip name').fill('BH com os amigos')
  await page.getByLabel('Destination').fill('Belo Horizonte')
  await page.getByLabel('First day').fill('2027-03-04')
  await page.getByLabel('Last day').fill('2027-03-06')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page).toHaveURL(/\/en\/trips\/[0-9a-f-]{36}/)
  await expect(page.getByRole('heading', { name: 'BH com os amigos' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Trip days' }).getByRole('button')).toHaveCount(
    4,
  )
  await page.goto('/en/trips')
  await expect(page.getByRole('link', { name: /BH com os amigos/ })).toBeVisible()
})

test('a trip that ends before it starts is refused with a reason', async ({ page, context }) => {
  await signIn(context, 'Ana')
  await page.goto('/en/trips/new')
  await page.getByLabel('Trip name').fill('BH')
  await page.getByLabel('Destination').fill('Belo Horizonte')
  await page.getByLabel('First day').fill('2027-03-06')
  await page.getByLabel('Last day').fill('2027-03-04')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(
    page.getByText('The last day must come after the first, up to 90 days.'),
  ).toBeVisible()
  await expect(page.getByLabel('Trip name')).toHaveValue('BH')
})

test('adds stops and edits one; everything is still there after a reload', async ({ page }) => {
  await openTrip(page)
  await addStop(page, 'Igrejinha')
  await addStop(page, 'Mineirão')
  await stop(page, 'Igrejinha')
    .getByRole('button', { name: /^Igrejinha/ })
    .click()
  await page.getByLabel('Starts').fill('09:30')
  await page.getByLabel('Ends').fill('10:15')
  await page.getByLabel('Place').fill('Pampulha')
  await page.getByLabel('Notes').fill('Ver os azulejos')
  await page.getByLabel('Notes').blur()
  await saved(page)
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['Igrejinha', 'Mineirão'])
  await expect(stop(page, 'Igrejinha')).toContainText('09:30 to 10:15')
  await stop(page, 'Igrejinha')
    .getByRole('button', { name: /^Igrejinha/ })
    .click()
  await expect(page.getByLabel('Notes')).toHaveValue('Ver os azulejos')
})

test('reorders by dragging', async ({ page }) => {
  await openTrip(page)
  for (const s of ['One', 'Two', 'Three']) await addStop(page, s)
  const last = (await stop(page, 'Three').boundingBox())!
  await drag(page, 'One', { x: center(last).x, y: last.y + last.height - 4 })
  await expect.poll(() => names(page)).toEqual(['Two', 'Three', 'One'])
  await saved(page)
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['Two', 'Three', 'One'])
})

test('reorders with the keyboard alone', async ({ page }) => {
  await openTrip(page)
  for (const s of ['One', 'Two']) await addStop(page, s)
  await stop(page, 'One')
    .getByRole('button', { name: /Reorder/ })
    .focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  await page.keyboard.press('Space')
  await expect.poll(() => names(page)).toEqual(['Two', 'One'])
})

test('drags a stop to another day, and can undo it', async ({ page }) => {
  await openTrip(page)
  await addStop(page, 'Inhotim')
  await drag(page, 'Inhotim', center((await leg(page, 'Fri').boundingBox())!))
  await expect.poll(() => names(page)).toEqual([])
  await leg(page, 'Fri').click()
  await expect.poll(() => names(page)).toEqual(['Inhotim'])
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => names(page)).toEqual([])
  await leg(page, 'Thu').click()
  await expect.poll(() => names(page)).toEqual(['Inhotim'])
})

test('keeps an idea and gives it a day later', async ({ page }) => {
  await openTrip(page)
  await leg(page, 'Ideas').click()
  await page.getByRole('button', { name: 'Add idea' }).click()
  await page.getByLabel('New idea').fill('CCBB')
  await page.getByLabel('New idea').press('Enter')
  await stop(page, 'CCBB').getByRole('button', { name: /^CCBB/ }).click()
  await page.getByLabel('Move to').selectOption({ label: 'Saturday, March 6' })
  await expect.poll(() => names(page)).toEqual([])
  await leg(page, 'Sat').click()
  await expect.poll(() => names(page)).toEqual(['CCBB'])
})

test('deletes a stop and brings it back', async ({ page }) => {
  await openTrip(page)
  await addStop(page, 'Museu')
  await stop(page, 'Museu')
    .getByRole('button', { name: /^Museu/ })
    .click()
  await page.getByRole('button', { name: 'Delete stop' }).click()
  await expect.poll(() => names(page)).toEqual([])
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => names(page)).toEqual(['Museu'])
  await saved(page)
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['Museu'])
})

test('names a day', async ({ page }) => {
  await openTrip(page)
  await page.getByLabel('Day name').fill('Chegada')
  await page.getByLabel('Day name').blur()
  await saved(page)
  await page.reload()
  await expect(leg(page, 'Chegada')).toBeVisible()
})

test('shortening the trip asks first and keeps the stops as ideas', async ({ page }) => {
  const tripId = await openTrip(page)
  await leg(page, 'Sat').click()
  await addStop(page, 'Volta')
  await saved(page)
  await page.goto(`/en/trips/${tripId}/settings`)
  await page.getByLabel('Last day').fill('2027-03-05')
  await expect(page.getByText('1 day will be removed. Its stops move to Ideas.')).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/en/trips/${tripId}$`))
  await leg(page, 'Ideas').click()
  await expect.poll(() => names(page)).toEqual(['Volta'])
})

test('archives a trip and brings it back', async ({ page }) => {
  const tripId = await openTrip(page)
  await page.goto(`/en/trips/${tripId}/settings`)
  await page.getByRole('button', { name: 'Archive trip' }).click()
  await expect(page).toHaveURL('/en/trips')
  await expect(page.getByRole('heading', { name: 'Archived' })).toBeVisible()
  await page.goto(`/en/trips/${tripId}/settings`)
  await page.getByRole('button', { name: 'Unarchive trip' }).click()
  await expect(page).toHaveURL('/en/trips')
  await expect(page.getByRole('heading', { name: 'Archived' })).toHaveCount(0)
})

test('a viewer sees everything and can change nothing', async ({ page, context, browser }) => {
  const owner = await signIn(await browser.newContext(), 'Pedro')
  const viewer = await signIn(context, 'Mae')
  const tripId = await seed(owner.id, [{ userId: viewer.id, role: 'viewer' }])
  await page.goto(`/en/trips/${tripId}`)
  await expect(page.getByText('View only')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add stop' })).toHaveCount(0)
  const res = await context.request.post(`/api/trips/${tripId}/operations`, {
    data: { opId: randomUUID(), op: { type: 'trip.update', fields: { title: 'Hacked' } } },
  })
  expect(res.status()).toBe(403)
  expect((await page.goto(`/en/trips/${tripId}/settings`))?.status()).toBe(404)
})

test('a stranger finds nothing', async ({ page, context, browser }) => {
  const owner = await signIn(await browser.newContext(), 'Pedro')
  const tripId = await seed(owner.id)
  await signIn(context, 'Estranho')
  expect((await page.goto(`/en/trips/${tripId}`))?.status()).toBe(404)
  expect((await context.request.get(`/api/trips/${tripId}`)).status()).toBe(404)
})

test('signed out, the API refuses', async ({ request }) => {
  const url = `/api/trips/${randomUUID()}/operations`
  expect((await request.post(url, { data: {} })).status()).toBe(401)
})

test('a malformed operation is refused', async ({ context }) => {
  const { id } = await signIn(context, 'Ana')
  const tripId = await seed(id)
  for (const data of ['not json', { opId: 'x', op: {} }]) {
    const res = await context.request.post(`/api/trips/${tripId}/operations`, {
      data,
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status()).toBe(400)
  }
})

test('simultaneous writes get one revision each and distinct positions', async ({ context }) => {
  const { id } = await signIn(context, 'Ana')
  const tripId = await seed(id)
  const results = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const op = {
        type: 'item.create',
        itemId: randomUUID(),
        dayId: null,
        position: 'a0',
        title: `Item ${i}`,
        kind: 'other',
      }
      const res = await context.request.post(`/api/trips/${tripId}/operations`, {
        data: { opId: randomUUID(), op },
      })
      return (await res.json()) as { revision: number; item: { position: string } }
    }),
  )
  expect(results.map((r) => r.revision).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 12 }, (_, i) => i + 1),
  )
  expect(new Set(results.map((r) => r.item.position)).size).toBe(12)
})

test('a change the server refuses is taken back, and said', async ({ page }) => {
  await openTrip(page)
  await addStop(page, 'Museu')
  await saved(page)
  await page.route('**/operations', (r) => r.fulfill({ status: 403, json: { error: 'forbidden' } }))
  await stop(page, 'Museu')
    .getByRole('button', { name: /^Museu/ })
    .click()
  await page.getByRole('button', { name: 'Delete stop' }).click()
  await expect(page.getByText('That change was not saved.')).toBeVisible()
  await expect.poll(() => names(page)).toEqual(['Museu'])
})

test('a change made while the connection drops is sent when it returns', async ({ page }) => {
  await openTrip(page)
  await addStop(page, 'Museu')
  await saved(page)
  await page.route('**/operations', (r) => r.abort())
  await addStop(page, 'Parque')
  await expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'offline')
  await page.unroute('**/operations')
  await saved(page)
  await page.reload()
  await expect.poll(() => names(page)).toEqual(['Museu', 'Parque'])
})
