import { randomUUID } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { applyOperation, createDb, createTrip, getTrip } from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

const stops = {
  'Casa do Baile': [-43.9701, -19.8545],
  'Casa Kubitschek': [-43.9803, -19.8549],
  Mineirão: [-43.9711, -19.866],
} as const

async function openTrip(page: Page, names: (keyof typeof stops)[]) {
  const { id } = await signIn(page.context(), 'Ana')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH',
    destination: 'Belo Horizonte',
    destinationLat: -19.92,
    destinationLng: -43.94,
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'America/Sao_Paulo',
  })
  const dayId = (await getTrip(db, id, tripId))!.days[0]!.id
  for (const [i, name] of names.entries()) {
    const [lng, lat] = stops[name]
    await applyOperation(db, {
      userId: id,
      tripId,
      opId: randomUUID(),
      op: {
        type: 'item.create',
        itemId: randomUUID(),
        dayId,
        position: `a${i}`,
        title: name,
        kind: 'activity',
        place: { placeName: name, address: null, lat, lng, osmRef: null },
      },
    })
  }
  await db.$client.end()
  await page.goto(`/en/trips/${tripId}`)
  return tripId
}

const map = (page: Page) => page.getByRole('region', { name: 'Trip map' })
const pin = (page: Page, name: string) => map(page).getByRole('button', { name, exact: true })
const stop = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })
const saved = (page: Page) =>
  expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'saved')

test('the stops of the day are numbered on the map', async ({ page }) => {
  await openTrip(page, ['Casa do Baile', 'Casa Kubitschek'])
  await expect(pin(page, '1. Casa do Baile')).toBeVisible()
  await expect(pin(page, '2. Casa Kubitschek')).toBeVisible()
})

test('the way between stops follows the streets, with its time', async ({ page }) => {
  await openTrip(page, ['Casa do Baile', 'Casa Kubitschek'])
  await expect(stop(page, 'Casa Kubitschek')).toContainText('25 min by car, 3.2 km')
  await expect(map(page)).toHaveAttribute('data-routed', '1')
  await expect(page.getByText('3.2 km by street')).toBeVisible()
})

test('says when there is no time to get there', async ({ page }) => {
  await openTrip(page, ['Casa do Baile', 'Casa Kubitschek'])
  for (const [name, start, end] of [
    ['Casa do Baile', '09:00', '10:00'],
    ['Casa Kubitschek', '10:10', '11:00'],
  ] as const) {
    await stop(page, name)
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click()
    await page.getByLabel('Starts').fill(start)
    await page.getByLabel('Ends').fill(end)
    await page.getByLabel('Ends').blur()
    await stop(page, name)
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click()
  }
  await expect(stop(page, 'Casa Kubitschek')).toContainText('no time to get there')
})

test('a pin opens its stop, and the stop its pin', async ({ page }) => {
  await openTrip(page, ['Casa do Baile', 'Mineirão'])
  await pin(page, '2. Mineirão').click()
  await expect(stop(page, 'Mineirão').getByRole('button', { name: /^Mineirão/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(pin(page, '2. Mineirão')).toHaveAttribute('aria-current', 'true')
})

test('shows every day at once, and a click there goes to its day', async ({ page }) => {
  await openTrip(page, ['Casa do Baile'])
  await page
    .getByRole('navigation', { name: 'Trip days' })
    .getByRole('button', { name: 'Fri' })
    .click()
  await expect(pin(page, '1. Casa do Baile')).toHaveCount(0)
  await map(page).getByRole('button', { name: 'See all days' }).click()
  await map(page).getByRole('button', { name: 'Casa do Baile' }).click()
  await expect(
    page.getByRole('navigation', { name: 'Trip days' }).getByRole('button', { name: 'Thu' }),
  ).toHaveAttribute('aria-current', 'true')
})

test('finds a place while adding a stop', async ({ page }) => {
  await openTrip(page, [])
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill('mercado')
  await page.getByRole('option', { name: /Mercado Central/ }).click()
  await expect(pin(page, '1. Mercado Central')).toBeVisible()
  await expect(stop(page, 'Mercado Central').getByRole('img', { name: 'Food' })).toBeVisible()
  await saved(page)
  await page.reload()
  await expect(pin(page, '1. Mercado Central')).toBeVisible()
})

test('finds a place with the keyboard', async ({ page }) => {
  await openTrip(page, [])
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill('mineir')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(pin(page, '1. Mineirão')).toBeVisible()
})

test('gives a place to a stop that had none; writing over it takes it off the map', async ({
  page,
}) => {
  await openTrip(page, [])
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill('Jogo')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await stop(page, 'Jogo').getByRole('button', { name: /^Jogo/ }).click()
  await page.getByLabel('Place').fill('mineir')
  await page.getByRole('option', { name: /Mineirão/ }).click()
  await expect(pin(page, '1. Jogo')).toBeVisible()
  await expect(page.getByLabel('Address')).toHaveValue('Belo Horizonte')
  await page.getByLabel('Place').fill('em algum lugar')
  await page.getByLabel('Place').blur()
  await expect(pin(page, '1. Jogo')).toHaveCount(0)
})

test('search being down still lets you add the stop', async ({ page }) => {
  await openTrip(page, [])
  await page.route('**/api/places**', (r) => r.fulfill({ status: 502, json: {} }))
  await page.getByRole('button', { name: 'Add stop' }).click()
  await page.getByLabel('New stop').fill('Mercado')
  await page.keyboard.press('Enter')
  await expect(stop(page, 'Mercado')).toBeVisible()
})

test('a map that cannot load leaves the itinerary working', async ({ page }) => {
  await page.route('**/style.json', (r) => r.abort())
  await openTrip(page, ['Casa do Baile'])
  await expect(map(page).getByText('The map did not load.')).toBeVisible()
  await expect(stop(page, 'Casa do Baile')).toBeVisible()
  await page.unroute('**/style.json')
  await map(page).getByRole('button', { name: 'Try again' }).click()
  await expect(pin(page, '1. Casa do Baile')).toBeVisible()
})

test('choosing the destination sets the clock and draws the cover', async ({ page, context }) => {
  await signIn(context, 'Ana')
  await page.goto('/en/trips/new')
  await page.getByLabel('Trip name').fill('BH')
  await page.getByLabel('Destination').fill('belo')
  await page.getByRole('option', { name: /Belo Horizonte/ }).click()
  await expect(page.getByLabel('Timezone')).toHaveValue('America/Sao_Paulo')
  await page.getByLabel('First day').fill('2027-03-04')
  await page.getByLabel('Last day').fill('2027-03-05')
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page).toHaveURL(/trips\/[0-9a-f-]{36}/)
  await expect(page.getByTestId('cover')).toHaveJSProperty('complete', true)
  expect(
    await page.getByTestId('cover').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0)
  await expect(map(page)).toBeVisible()
})

test('a trip without a place on the map has no map', async ({ page, context }) => {
  const { id } = await signIn(context, 'Ana')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'X',
    destination: 'X',
    startDate: '2027-03-04',
    endDate: '2027-03-04',
    timezone: 'UTC',
  })
  await db.$client.end()
  await page.goto(`/en/trips/${tripId}`)
  await expect(page.getByRole('heading', { name: 'X', exact: true })).toBeVisible()
  await expect(map(page)).toHaveCount(0)
})

test('search, routes and covers are closed to strangers', async ({
  page,
  request,
  context,
  browser,
}) => {
  const tripId = await openTrip(page, ['Casa do Baile'])
  const outside = await browser.newContext()
  await signIn(outside, 'Estranho')
  for (const path of ['routes', 'relief']) {
    expect((await request.get(`/api/trips/${tripId}/${path}`)).status()).toBe(401)
    expect((await outside.request.get(`${env.APP_URL}/api/trips/${tripId}/${path}`)).status()).toBe(
      404,
    )
  }
  expect((await request.get('/api/places?q=casa')).status()).toBe(401)
  expect((await context.request.get('/api/places?q=')).status()).toBe(400)
})

test('searching too fast is slowed down', async ({ context }) => {
  await signIn(context, 'Robo')
  const statuses: number[] = []
  for (let i = 0; i < 45; i++)
    statuses.push((await context.request.get(`/api/places?q=casa${i}`)).status())
  expect(statuses[0]).toBe(200)
  expect(statuses.at(-1)).toBe(429)
})
