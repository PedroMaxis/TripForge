import { createHmac, randomUUID } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'
import { createDb, sessions, users } from '@tripforge/db'
import { env } from './env'

/** Signs a fresh user in by writing the session Better Auth would have created after OAuth. */
export async function signIn(context: BrowserContext, name: string) {
  const db = createDb(env.DATABASE_URL)
  const id = randomUUID()
  const token = randomUUID()
  await db.insert(users).values({ id, name, email: `${id}@example.com` })
  await db
    .insert(sessions)
    .values({ id: randomUUID(), token, userId: id, expiresAt: new Date(Date.now() + 3_600_000) })
  await db.$client.end()

  const signature = createHmac('sha256', env.BETTER_AUTH_SECRET).update(token).digest('base64')
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: encodeURIComponent(`${token}.${signature}`),
      url: env.APP_URL,
      httpOnly: true,
    },
  ])
  return { id }
}
