import { randomInt, randomUUID } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { env } from './env'

const ownAddress = () => ({
  'x-forwarded-for': `10.3.${randomInt(256)}.${randomInt(1, 255)}`,
})
test.beforeEach(({ context }) => context.setExtraHTTPHeaders(ownAddress()))
const old = 'the first password'
const mailsTo = async (page: Page, to: string) => {
  const res = await page.request.get(`${new URL(env.PHOTON_URL).origin}/mails`)
  return ((await res.json()) as { to: string; body: string }[]).filter((m) => m.to === to)
}
const readable = (body: string) => body.replace(/=\r?\n/g, '').replace(/=3D/g, '=')

async function signUp(page: Page, email: string) {
  await page.goto('/en/sign-up')
  await page.getByLabel('Name').fill('Ana')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(old)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/en/trips')
}
async function ask(page: Page, email: string) {
  await page.goto('/en/sign-in')
  await page.getByRole('link', { name: 'I forgot my password' }).click()
  // Both pages have an email field; this is the wrong moment to mix them up.
  await expect(page).toHaveURL('/en/forgot')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send the link' }).click()
  await expect(
    page.getByText('If there is an account with this email, the link is on its way.'),
  ).toBeVisible()
}

test('a forgotten password is replaced by email, and other sessions end', async ({
  page,
  browser,
}) => {
  const email = `${randomUUID()}@example.com`
  await signUp(page, email)
  const other = await (
    await browser.newContext({ baseURL: env.APP_URL, extraHTTPHeaders: ownAddress() })
  ).newPage()
  await ask(other, email)
  await expect.poll(async () => (await mailsTo(page, email)).length).toBe(1)
  const link = readable((await mailsTo(page, email))[0]!.body).match(
    /http:\/\/localhost:3100\/en\/reset\?token=[\w-]+/,
  )![0]
  await other.goto(link)
  await other.getByLabel('New password').fill('a brand new password')
  await other.getByRole('button', { name: 'Save password' }).click()
  await expect(other.getByText('Password changed. You can sign in now.')).toBeVisible()

  await page.goto('/en/trips')
  await expect(page).toHaveURL('/en/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/en/trips')

  await other.goto(link)
  await other.getByLabel('New password').fill('yet another password')
  await other.getByRole('button', { name: 'Save password' }).click()
  await expect(other.getByText('This link no longer works.')).toBeVisible()
})

test('an unknown email gets the same answer and no mail', async ({ page }) => {
  const email = `${randomUUID()}@example.com`
  await ask(page, email)
  await page.waitForTimeout(500)
  expect(await mailsTo(page, email)).toEqual([])
})
