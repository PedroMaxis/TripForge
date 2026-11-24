import { randomInt, randomUUID } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import { createDb, users } from '@tripforge/db'
import { eq } from 'drizzle-orm'
import { env } from './env'

// Attempts are limited per IP address, so each test gets its own.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
  })
})

const password = 'correct horse battery'
const newEmail = () => `${randomUUID()}@example.com`

async function signUp(page: Page, email: string) {
  await page.goto('/en/sign-up')
  await page.getByLabel('Name').fill('Ana')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function signIn(page: Page, email: string, withPassword = password) {
  await page.goto('/en')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(withPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a new person signs up and lands on their trips', async ({ page }) => {
  await page.goto('/en')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL('/en/sign-up')
  await signUp(page, newEmail())
  await expect(page).toHaveURL('/en/trips')
  await expect(page.getByText('Ana')).toBeVisible()
})

test('comes back later with the same email, whatever its case', async ({ page }) => {
  const email = newEmail()
  await signUp(page, email)
  await expect(page).toHaveURL('/en/trips')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/en')
  await signIn(page, email.toUpperCase())
  await expect(page).toHaveURL('/en/trips')
})

test('remembers the language they signed up in', async ({ page }) => {
  const email = newEmail()
  await page.goto('/pt-BR/sign-up')
  await page.getByLabel('Nome').fill('Ana')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page).toHaveURL('/pt-BR/trips')

  const db = createDb(env.DATABASE_URL)
  const [user] = await db.select().from(users).where(eq(users.email, email))
  await db.$client.end()
  expect(user?.locale).toBe('pt-BR')
})

test('never stores the password itself', async ({ page }) => {
  const email = newEmail()
  await signUp(page, email)
  await expect(page).toHaveURL('/en/trips')

  const db = createDb(env.DATABASE_URL)
  const account = await db.query.accounts.findFirst({
    where: (a, { inArray }) =>
      inArray(a.userId, db.select({ id: users.id }).from(users).where(eq(users.email, email))),
  })
  await db.$client.end()
  expect(account?.password).toBeTruthy()
  expect(account?.password).not.toContain(password)
})

test('a wrong password and an unknown email get the same answer', async ({ page }) => {
  const email = newEmail()
  await signUp(page, email)
  await expect(page).toHaveURL('/en/trips')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/en')

  await signIn(page, email, 'not the password')
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
  await signIn(page, newEmail())
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
  await expect(page).toHaveURL('/en')
})

test('an email can only be used once', async ({ page }) => {
  const email = newEmail()
  await signUp(page, email)
  await expect(page).toHaveURL('/en/trips')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/en')
  await signUp(page, email)
  await expect(page.getByText('There is already an account with this email.')).toBeVisible()
})

test('the server refuses short passwords even without the form', async ({ context }) => {
  const res = await context.request.post('/api/auth/sign-up/email', {
    data: { name: 'Ana', email: newEmail(), password: 'short' },
    headers: { origin: env.APP_URL },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).code).toBe('PASSWORD_TOO_SHORT')
})

test('guessing passwords is cut off after five tries', async ({ page }) => {
  const email = newEmail()
  for (let i = 0; i < 5; i++) {
    const answer = page.waitForResponse('**/api/auth/sign-in/email')
    await signIn(page, email, `guess number ${i}`)
    expect((await answer).status()).toBe(401)
  }
  await signIn(page, email, 'one guess too many')
  await expect(page.getByText('Too many attempts. Wait a minute and try again.')).toBeVisible()
})

test('someone already signed in skips the sign-up page', async ({ page }) => {
  await signUp(page, newEmail())
  await expect(page).toHaveURL('/en/trips')
  await page.goto('/en/sign-up')
  await expect(page).toHaveURL('/en/trips')
})

test('without JavaScript the password never ends up in the address bar', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: env.APP_URL })
  const page = await context.newPage()
  await page.goto('/en')
  await page.getByLabel('Email').fill('ana@example.com')
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  expect(page.url()).not.toContain('password')
  await context.close()
})
