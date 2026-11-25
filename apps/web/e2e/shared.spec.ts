import { randomUUID } from 'node:crypto'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { applyOperation, createDb, createTrip, getTrip } from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

async function makeTrip(page: Page, name = 'Pedro') {
  const { id } = await signIn(page.context(), name)
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH com os amigos',
    destination: 'Belo Horizonte',
    destinationLat: -19.92,
    destinationLng: -43.94,
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'America/Sao_Paulo',
  })
  const dayId = (await getTrip(db, id, tripId))!.days[0]!.id
  const add = async (title: string, lng: number, lat: number, position: string) => {
    const itemId = randomUUID()
    await applyOperation(db, {
      userId: id,
      tripId,
      opId: randomUUID(),
      op: {
        type: 'item.create',
        itemId,
        dayId,
        position,
        title,
        kind: 'activity',
        place: { placeName: title, address: 'Pampulha', lat, lng, osmRef: null },
      },
    })
    return itemId
  }
  const first = await add('Casa do Baile', -43.9701, -19.8545, 'a0')
  await add('Casa Kubitschek', -43.9803, -19.8549, 'a1')
  await applyOperation(db, {
    userId: id,
    tripId,
    opId: randomUUID(),
    op: {
      type: 'item.update',
      itemId: first,
      baseVersion: 1,
      fields: { startTime: '09:30', endTime: '10:15', notes: 'Levar água' },
    },
  })
  await db.$client.end()
  return { tripId, id, dayId }
}

async function viewLink(page: Page, tripId: string) {
  await page.goto(`/en/trips/${tripId}/people`)
  await page
    .getByLabel('People with the link')
    .selectOption({ label: 'View only, no account needed' })
  await page.getByRole('button', { name: 'Create link' }).click()
  const link = page.getByLabel('Invite link')
  await expect(link).toHaveValue(/\/see\/[\w-]{40,}$/)
  return link.inputValue()
}
const stranger = async (browser: Browser) =>
  (await browser.newContext({ baseURL: env.APP_URL })).newPage()
const stop = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

test('opens straight on the itinerary, with no account in sight', async ({ page, browser }) => {
  const { tripId } = await makeTrip(page)
  const mom = await stranger(browser)
  await mom.goto(await viewLink(page, tripId))
  await expect(mom.getByRole('heading', { name: 'BH com os amigos' })).toBeVisible()
  await expect(stop(mom, 'Casa do Baile')).toContainText('09:30 to 10:15')
  await expect(stop(mom, 'Casa Kubitschek')).toContainText('25 min by car')
  await expect(
    mom.getByRole('region', { name: 'Trip map' }).getByRole('button', { name: '1. Casa do Baile' }),
  ).toBeVisible()
  for (const name of [
    /sign in/i,
    /account/i,
    /invite/i,
    /settings/i,
    /history/i,
    /add stop/i,
    /reorder/i,
  ]) {
    await expect(mom.getByRole('link', { name })).toHaveCount(0)
    await expect(mom.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(mom.getByLabel('Email')).toHaveCount(0)
})

test('a tap shows the details, and the days can be walked through', async ({ page, browser }) => {
  const { tripId } = await makeTrip(page)
  const mom = await stranger(browser)
  await mom.goto(await viewLink(page, tripId))
  await stop(mom, 'Casa do Baile').getByRole('button').click()
  await expect(mom.getByText('Levar água')).toBeVisible()
  await mom
    .getByRole('navigation', { name: 'Trip days' })
    .getByRole('button', { name: 'Fri' })
    .click()
  await expect(mom.getByText('Nothing planned yet.')).toBeVisible()
})

test('shows changes by itself', async ({ page, browser }) => {
  const { tripId } = await makeTrip(page)
  const mom = await stranger(browser)
  await mom.goto(await viewLink(page, tripId))
  await expect(stop(mom, 'Casa do Baile')).toBeVisible()
  await page.goto(`/en/trips/${tripId}`)
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill('Novidade')
  await page.getByLabel('New stop').press('Enter')
  await expect(stop(mom, 'Novidade')).toBeVisible({ timeout: 20_000 })
})

test('gives away nothing about the people', async ({ page, browser }) => {
  const { tripId, id } = await makeTrip(page, 'Nomesecreto')
  const link = await viewLink(page, tripId)
  const token = link.split('/').at(-1)
  const mom = await stranger(browser)
  const html = await (await mom.goto(link))!.text()
  const json = await (await mom.request.get(`/api/see/${token}`)).text()
  for (const text of [html, json]) {
    expect(text).not.toContain('Nomesecreto')
    expect(text).not.toContain(id)
    expect(text).not.toContain('@example.com')
  }
})

test('opens only what it is for', async ({ page, browser }) => {
  const { tripId } = await makeTrip(page)
  const token = (await viewLink(page, tripId)).split('/').at(-1)
  const mom = await stranger(browser)
  await mom.goto(`/en/see/${token}`)
  expect((await mom.request.get(`/api/trips/${tripId}`)).status()).toBe(401)
  expect((await mom.request.get(`/api/trips/${tripId}/log?since=0`)).status()).toBe(401)
  expect((await mom.request.get('/api/realtime-token')).status()).toBe(401)
  expect((await mom.request.get('/api/places?q=casa')).status()).toBe(401)
  const write = await mom.request.post(`/api/trips/${tripId}/operations`, {
    data: { opId: randomUUID(), op: { type: 'trip.update', fields: { title: 'X' } } },
  })
  expect(write.status()).toBe(401)
  expect((await mom.request.post(`/api/see/${token}`, { data: {} })).status()).toBe(405)
})

test('stops at once for new visits when revoked, and soon for who has it open', async ({
  page,
  browser,
}) => {
  const { tripId } = await makeTrip(page)
  const link = await viewLink(page, tripId)
  const mom = await stranger(browser)
  await mom.goto(link)
  await expect(stop(mom, 'Casa do Baile')).toBeVisible()
  await page.getByRole('button', { name: 'Revoke link' }).click()
  await expect(page.getByRole('button', { name: 'Revoke link' })).toHaveCount(0)
  await expect(mom.getByText('This invite was revoked.')).toBeVisible({ timeout: 20_000 })
  await expect(stop(mom, 'Casa do Baile')).toHaveCount(0)
  const again = await stranger(browser)
  await again.goto(link)
  await expect(again.getByText('This invite was revoked.')).toBeVisible()
  const token = link.split('/').at(-1)
  for (const path of ['', '/routes', '/relief'])
    expect((await again.request.get(`/api/see/${token}${path}`)).status()).toBe(410)
})

test('a made-up or an edit link opens nothing', async ({ page, browser }) => {
  const { tripId } = await makeTrip(page)
  await page.goto(`/en/trips/${tripId}/people`)
  await page.getByLabel('People with the link').selectOption({ label: 'Can edit, with an account' })
  await page.getByRole('button', { name: 'Create link' }).click()
  await expect(page.getByLabel('Invite link')).toHaveValue(/\/invite\//)
  const edit = (await page.getByLabel('Invite link').inputValue()).split('/').at(-1)
  const mom = await stranger(browser)
  for (const token of [edit, 'x'.repeat(43)]) {
    expect((await mom.goto(`/en/see/${token}`))?.status()).toBe(404)
    expect((await mom.request.get(`/api/see/${token}`)).status()).toBe(404)
  }
})

test('someone already in the trip goes to the real one; someone with an account may keep it', async ({
  page,
  browser,
}) => {
  const { tripId } = await makeTrip(page)
  const link = await viewLink(page, tripId)
  await page.goto(link)
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`))
  const context = await browser.newContext({ baseURL: env.APP_URL })
  await signIn(context, 'Tia')
  const aunt = await context.newPage()
  await aunt.goto(link)
  await expect(stop(aunt, 'Casa do Baile')).toBeVisible()
  await aunt.getByRole('button', { name: 'Keep in my trips' }).click()
  await expect(aunt).toHaveURL(new RegExp(`/trips/${tripId}`))
})

test('an old view invite opens the itinerary too', async ({ page, browser }) => {
  const { tripId } = await makeTrip(page)
  const token = (await viewLink(page, tripId)).split('/').at(-1)
  const mom = await stranger(browser)
  await mom.goto(`/en/invite/${token}`)
  await expect(mom).toHaveURL(`/en/see/${token}`)
})

test('says what it is when the link is pasted in a chat, and stays out of search', async ({
  page,
  browser,
}) => {
  const { tripId } = await makeTrip(page)
  const mom = await stranger(browser)
  await mom.goto(await viewLink(page, tripId))
  await expect(mom.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'BH com os amigos',
  )
  await expect(mom.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})
