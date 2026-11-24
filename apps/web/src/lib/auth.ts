import { defaultLocale, locales } from '@tripforge/core'
import { accounts, sessions, users, verifications } from '@tripforge/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { db } from './db'
import { env } from './env'

function create() {
  const e = env()
  return betterAuth({
    appName: 'TripForge',
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: 'pg',
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    user: {
      additionalFields: {
        locale: { type: [...locales], defaultValue: defaultLocale, required: false },
      },
    },
    // Counted per IP address, and only for requests that arrive over HTTP.
    // That is why the forms call the API instead of a server action.
    rateLimit: {
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 10 },
      },
    },
    // Caddy is the only thing in front of the app and it overwrites this header.
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    telemetry: { enabled: false },
    plugins: [nextCookies()],
  })
}

export type Auth = ReturnType<typeof create>

let instance: Auth | undefined

export function auth() {
  instance ??= create()
  return instance
}

/** The current session, looked up at most once per request. */
export const getSession = cache(async () => auth().api.getSession({ headers: await headers() }))
