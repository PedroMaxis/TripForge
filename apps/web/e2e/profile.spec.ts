import { randomInt, randomUUID } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
  })
})
const password = 'correct horse battery'

async function signUp(page: Page) {
  const email = `${randomUUID()}@example.com`
  await page.goto('/en/sign-up')
  await page.getByLabel('Name').fill('Ana')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/en/trips')
  return email
}
async function signIn(page: Page, email: string, withPassword: string) {
  await page.goto('/en/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(withPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('someone changes their name and password', async ({ page }) => {
  const email = await signUp(page)
  await page.getByRole('link', { name: 'Ana' }).click()
  await expect(page.getByText(email)).toBeVisible()
  await page.getByLabel('How others see you').fill('Ana Maria')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.getByLabel('Current password').fill('not this one')
  await page.getByLabel('New password').fill('a brand new password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('That is not your password.')).toBeVisible()
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Saved.')).toHaveCount(2)
  await page.getByRole('link', { name: 'My trips' }).click()
  await expect(page.getByRole('link', { name: 'Ana Maria' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/en')
  await signIn(page, email, 'a brand new password')
  await expect(page).toHaveURL('/en/trips')
})

test('someone takes their data and deletes the account', async ({ page }) => {
  const email = await signUp(page)
  await page.goto('/en/account')
  const data = await page.request.get('/api/account/export')
  expect(await data.json()).toMatchObject({ account: { email }, trips: [] })
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.getByLabel('Confirm with your password').fill('not this one')
  await page.getByRole('button', { name: 'Delete my account forever' }).click()
  await expect(page.getByText('That is not your password.')).toBeVisible()
  await page.getByLabel('Confirm with your password').fill(password)
  await page.getByRole('button', { name: 'Delete my account forever' }).click()
  await expect(page).toHaveURL('/en')
  expect((await page.request.get('/api/account/export')).status()).toBe(401)
  await page.goto('/en/account')
  await expect(page).toHaveURL('/en/sign-in')
  await signIn(page, email, password)
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
})

test('nobody deletes an account from another site, or without being signed in', async ({
  page,
}) => {
  const post = (type: string) =>
    page.request.post('/api/account/delete', {
      headers: { 'content-type': type },
      data: JSON.stringify({ password, locale: 'en' }),
    })
  expect((await post('application/json')).status()).toBe(401)
  await signUp(page)
  expect((await post('text/plain')).status()).toBe(400)
  await page.goto('/en/account')
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
})

test('anyone can read how data is kept', async ({ page }) => {
  await page.goto('/pt-BR')
  await page.getByRole('link', { name: 'Privacidade' }).click()
  await expect(page.getByRole('heading', { name: 'Privacidade' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(7)
})
