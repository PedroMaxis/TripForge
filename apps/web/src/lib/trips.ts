'use server'

import { isDate, newTripSchema } from '@tripforge/core'
import { createTrip, duplicateTrip } from '@tripforge/db'
import { redirect } from 'next/navigation'
import { hasLocale } from 'next-intl'
import type { z } from 'zod'
import { routing } from '@/i18n/routing'
import { getSession } from './auth'
import { db } from './db'
import { readTripForm } from './trip-form'

export type TripFormError = 'title' | 'destination' | 'dates' | 'timezone'

const localePrefix = (locale: string) =>
  `/${hasLocale(routing.locales, locale) ? locale : routing.defaultLocale}`

type CopyForm = { title: string; startDate: string; failed: boolean }

export async function duplicateTripAction(
  locale: string,
  tripId: string,
  _: CopyForm,
  form: FormData,
): Promise<CopyForm> {
  const prefix = localePrefix(locale)
  const session = await getSession()
  if (!session) redirect(`${prefix}/sign-in`)
  const title = String(form.get('title') ?? '').trim()
  const startDate = String(form.get('startDate') ?? '')
  const copyId =
    title && title.length <= 120 && isDate(startDate)
      ? await duplicateTrip(db(), session.user.id, String(tripId), { title, startDate })
      : null
  if (!copyId) return { title, startDate, failed: true }
  redirect(`${prefix}/trips/${copyId}`)
}

export async function createTripAction(
  locale: string,
  _: TripFormError | null,
  form: FormData,
): Promise<TripFormError | null> {
  const prefix = localePrefix(locale)
  const session = await getSession()
  if (!session) redirect(`${prefix}/sign-in`)
  const parsed = newTripSchema.safeParse(readTripForm(Object.fromEntries(form)))
  if (!parsed.success) return firstError(parsed.error)
  const tripId = await createTrip(db(), session.user.id, parsed.data)
  redirect(`${prefix}/trips/${tripId}`)
}

function firstError(error: z.ZodError): TripFormError {
  const field = error.issues[0]?.path[0]
  return field === 'title' || field === 'destination' || field === 'timezone' ? field : 'dates'
}
