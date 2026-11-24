'use server'

import { newTripSchema } from '@tripforge/core'
import { createTrip } from '@tripforge/db'
import { redirect } from 'next/navigation'
import { hasLocale } from 'next-intl'
import type { z } from 'zod'
import { routing } from '@/i18n/routing'
import { getSession } from './auth'
import { db } from './db'

export type TripFormError = 'title' | 'destination' | 'dates' | 'timezone'

export async function createTripAction(
  locale: string,
  _: TripFormError | null,
  form: FormData,
): Promise<TripFormError | null> {
  const prefix = `/${hasLocale(routing.locales, locale) ? locale : routing.defaultLocale}`
  const session = await getSession()
  if (!session) redirect(prefix)
  const parsed = newTripSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return firstError(parsed.error)
  const tripId = await createTrip(db(), session.user.id, parsed.data)
  redirect(`${prefix}/trips/${tripId}`)
}

function firstError(error: z.ZodError): TripFormError {
  const field = error.issues[0]?.path[0]
  return field === 'title' || field === 'destination' || field === 'timezone' ? field : 'dates'
}
