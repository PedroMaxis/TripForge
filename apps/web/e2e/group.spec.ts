import { randomUUID } from 'node:crypto'
import { type Browser, expect, type Page, test } from '@playwright/test'
import {
  applyOperation,
  createDb,
  createInvite,
  createTrip,
  getTrip,
  tripMembers,
} from '@tripforge/db'
import { env } from './env'
import { signIn } from './session'

async function person(browser: Browser, name: string) {
  const context = await browser.newContext({ baseURL: env.APP_URL })
  const { id } = await signIn(context, name)
  return { page: await context.newPage(), id }
}

/** Pedro's trip, where Ana plans too and Bia only looks. */
async function makeTrip(page: Page, browser: Browser) {
  const { id } = await signIn(page.context(), 'Pedro')
  const ana = await person(browser, 'Ana')
  const bia = await person(browser, 'Bia')
  const db = createDb(env.DATABASE_URL)
  const tripId = await createTrip(db, id, {
    title: 'BH com os amigos',
    destination: 'Belo Horizonte',
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'America/Sao_Paulo',
  })
  await db.insert(tripMembers).values([
    { tripId, userId: ana.id, role: 'editor' },
    { tripId, userId: bia.id, role: 'viewer' },
  ])
  const dayId = (await getTrip(db, id, tripId))!.days[0]!.id
  const add = async (title: string, day: string | null) => {
    const itemId = randomUUID()
    await applyOperation(db, {
      userId: id,
      tripId,
      opId: randomUUID(),
      op: { type: 'item.create', itemId, dayId: day, position: 'a0', title, kind: 'activity' },
    })
    return itemId
  }
  const itemId = await add('Casa do Baile', dayId)
  await add('Inhotim', null)
  const { token } = await createInvite(db, id, tripId, 'viewer')
  await db.$client.end()
  return { tripId, itemId, token, ana: ana.page, bia: bia.page }
}
const saved = (page: Page) =>
  expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'saved')
const row = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text })

test('people vote for ideas and see each other vote', async ({ page, browser }) => {
  const { tripId, ana, bia } = await makeTrip(page, browser)
  for (const p of [page, ana, bia]) await p.goto(`/en/trips/${tripId}?day=ideas`)
  await page.getByRole('button', { name: 'Vote for Inhotim, no votes' }).click()
  await ana.getByRole('button', { name: 'Vote for Inhotim, 1 vote' }).click()
  await expect(page.getByRole('button', { name: 'Vote for Inhotim, 2 votes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: /Vote for Inhotim/ }).click()
  await expect(ana.getByRole('button', { name: 'Vote for Inhotim, 1 vote' })).toBeVisible()
  await expect(row(bia, 'Inhotim')).toBeVisible()
  await expect(bia.getByRole('button', { name: /Vote/ })).toHaveCount(0)
})

test('a stop keeps its booking, files and comments, for who plans the trip', async ({
  page,
  browser,
}) => {
  const { tripId, token, ana, bia } = await makeTrip(page, browser)
  await ana.goto(`/en/trips/${tripId}`)
  await page.goto(`/en/trips/${tripId}`)
  await page.getByTestId('stop-name').first().click()
  await page.getByText('Booking', { exact: true }).click()
  await page.getByLabel('Booking code').fill('XYZ789')
  await page.getByLabel('Booking code').blur()
  await page.getByText('Comments', { exact: true }).click()
  await page.getByLabel('New comment').fill('Segredo da turma')
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
  await page.getByText('Files', { exact: true }).click()
  await page.getByLabel('Add a PDF or a picture').setInputFiles({
    name: 'Passagem da Ana.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 oi'),
  })
  const file = page.getByRole('link', { name: 'Passagem da Ana.pdf' })
  await expect(file).toBeVisible()
  await saved(page)

  await expect(row(ana, 'Casa do Baile')).toContainText('Booked, 1 file, 1 comment')
  await ana.getByTestId('stop-name').first().click()
  await ana.getByText('1 comment', { exact: true }).click()
  const comment = row(ana, 'Segredo da turma').last()
  await expect(comment).toContainText('Pedro')
  await expect(comment.getByRole('button', { name: 'Remove' })).toHaveCount(0)

  const href = (await file.getAttribute('href'))!
  const got = await ana.request.get(href)
  expect(got.headers()).toMatchObject({
    'content-type': 'application/pdf',
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
  })
  expect(await got.text()).toBe('%PDF-1.4 oi')

  // Nobody else gets any of it.
  const mom = await (await browser.newContext({ baseURL: env.APP_URL })).newPage()
  expect((await bia.request.get(href)).status()).toBe(404)
  expect((await mom.request.get(href)).status()).toBe(401)
  const secrets = /XYZ789|Segredo|Passagem/
  for (const [p, url] of [
    [bia, `/api/trips/${tripId}`],
    [bia, `/api/trips/${tripId}/log?since=0`],
    [bia, `/en/trips/${tripId}`],
    [bia, `/en/trips/${tripId}/history`],
    [mom, `/api/see/${token}`],
    [mom, `/en/see/${token}`],
    [mom, `/en/see/${token}/print`],
    [mom, `/api/see/${token}/calendar`],
  ] as const) {
    const res = await p.request.get(url)
    expect(res.status(), url).toBe(200)
    expect(await res.text(), url).not.toMatch(secrets)
  }
  await page.getByRole('button', { name: 'Remove Passagem da Ana.pdf' }).click()
  await expect(file).toHaveCount(0)
  await saved(page)
  expect((await ana.request.get(href)).status()).toBe(404)
})

test('a file that is not what it should be is refused, with a reason', async ({
  page,
  browser,
}) => {
  const { tripId, itemId, bia } = await makeTrip(page, browser)
  await page.goto(`/en/trips/${tripId}`)
  await page.getByTestId('stop-name').first().click()
  await page.getByText('Files', { exact: true }).click()
  const input = page.getByLabel('Add a PDF or a picture')
  await input.setInputFiles({
    name: 'a.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<script>alert(1)</script>'),
  })
  await expect(page.getByText('Only PDF, JPG, PNG and WebP files.')).toBeVisible()
  await input.setInputFiles({
    name: 'a.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(page.getByText('This file is over 5 MB.')).toBeVisible()
  const url = `/api/trips/${tripId}/attachments?item=${itemId}&op=${randomUUID()}&name=a.pdf`
  const post = (who: Page, data: Buffer, type: string) =>
    who.request.post(url, { data, headers: { 'content-type': type } })
  const stream = 'application/octet-stream'
  expect((await post(page, Buffer.alloc(6 * 1024 * 1024), stream)).status()).toBe(413)
  expect((await post(page, Buffer.from('%PDF-'), 'text/plain')).status()).toBe(415)
  expect((await post(bia, Buffer.from('%PDF-'), stream)).status()).toBe(403)
})

test('the group writes down what it spends and settles up', async ({ page, browser }) => {
  const { tripId, ana, bia } = await makeTrip(page, browser)
  await ana.goto(`/en/trips/${tripId}/money`)
  await page.goto(`/en/trips/${tripId}`)
  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByText('No expenses yet')).toBeVisible()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Say what it was.')).toBeVisible()
  await page.getByLabel('What was it?').fill('Airbnb')
  await page.getByLabel('Amount').fill('abc')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Write an amount')).toBeVisible()
  await page.getByLabel('Amount').fill('1,000.50')
  await page.getByLabel('Currency').selectOption('BRL')
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await page.getByRole('button', { name: 'Save' }).click()

  const settle = (p: Page) => p.getByRole('region', { name: 'To settle up' })
  await expect(settle(page)).toContainText('Ana pays you R$500.25')
  await expect(settle(ana)).toContainText('You pay Pedro R$500.25')
  await expect(ana.getByText('Pedro paid, for Pedro, You')).toBeVisible()

  await ana.getByRole('button', { name: /Airbnb/ }).click()
  await ana.getByLabel('Amount').fill('900')
  await ana.getByRole('button', { name: 'Save' }).click()
  await expect(settle(page)).toContainText('Ana pays you R$450.00')

  await ana.getByRole('button', { name: 'Mark as paid' }).click()
  await expect(settle(page)).toContainText('All settled.')
  await expect(page.getByText('Ana paid You')).toBeVisible()
  await ana.getByRole('button', { name: 'Undo' }).click()
  await expect(settle(page)).toContainText('Ana pays you R$450.00')

  await page.getByRole('button', { name: /Airbnb/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(ana.getByText('No expenses yet')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(ana.getByRole('button', { name: /Airbnb/ })).toBeVisible()

  expect((await bia.goto(`/en/trips/${tripId}/money`))?.status()).toBe(404)
  await bia.goto(`/en/trips/${tripId}`)
  await expect(bia.getByRole('heading', { name: 'BH com os amigos' })).toBeVisible()
  await expect(bia.getByRole('link', { name: 'Expenses' })).toHaveCount(0)
})

test('lists say what is left and who takes care of it', async ({ page, browser }) => {
  const { tripId, ana } = await makeTrip(page, browser)
  await ana.goto(`/pt-BR/trips/${tripId}/lists`)
  await page.goto(`/en/trips/${tripId}/lists`)
  const pack = page.getByRole('region', { name: 'To pack' })
  await pack.getByLabel('New thing to pack').fill('Adaptador')
  await pack.getByRole('button', { name: 'Add' }).click()
  await pack.getByLabel('Who takes care of Adaptador').selectOption({ label: 'Ana' })
  const mala = ana.getByRole('region', { name: 'Mala' })
  await expect(mala.getByLabel('Quem cuida de Adaptador')).toHaveValue(/.+/)
  await mala.getByRole('checkbox', { name: 'Adaptador, pronto' }).check()
  await expect(pack).toContainText('1 of 1 done')
  await saved(page)
  await pack.getByRole('button', { name: 'Remove Adaptador' }).click()
  await expect(mala).toContainText('Nada pra levar ainda.')
})

test('what is written without connection is sent when it is back', async ({ page, browser }) => {
  const { tripId, ana } = await makeTrip(page, browser)
  await ana.goto(`/en/trips/${tripId}/lists`)
  await page.goto(`/en/trips/${tripId}/lists`)
  const todo = page.getByRole('region', { name: 'To do' })
  await expect(todo).toBeVisible()
  await page.context().setOffline(true)
  await todo.getByLabel('New task').fill('Passaporte')
  await todo.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByTestId('sync')).toHaveAttribute('data-state', 'offline')
  await page.context().setOffline(false)
  await saved(page)
  await expect(
    ana.getByRole('region', { name: 'To do' }).getByRole('checkbox', { name: 'Passaporte, done' }),
  ).toBeVisible()
})

test('someone turned into a viewer loses what is only for the group', async ({ page, browser }) => {
  const { tripId, ana } = await makeTrip(page, browser)
  await ana.goto(`/en/trips/${tripId}/money`)
  await expect(ana.getByText('No expenses yet')).toBeVisible()
  await page.goto(`/en/trips/${tripId}/people`)
  await page.getByLabel('Role of Ana').selectOption({ label: 'View only' })
  await expect(ana.getByText('Only people who edit this trip see this')).toBeVisible()
  await expect(ana.getByRole('button', { name: 'Add expense' })).toHaveCount(0)
})
