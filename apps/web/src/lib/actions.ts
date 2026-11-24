'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { auth } from './auth'

export async function signOut(locale: string) {
  await auth().api.signOut({ headers: await headers() })
  // Server actions are public endpoints, so the argument is checked before it goes into a URL.
  redirect(`/${hasLocale(routing.locales, locale) ? locale : routing.defaultLocale}`)
}
