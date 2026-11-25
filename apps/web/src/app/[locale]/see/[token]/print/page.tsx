import { getSharedTrip } from '@tripforge/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { Printable } from '@/components/trip/printable'
import { redirect } from '@/i18n/navigation'
import { db } from '@/lib/db'

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' }

export default async function SharedPrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const shared = await getSharedTrip(db(), token)
  if (shared.status === 'unknown') notFound()
  // The page of the trip says why it is gone.
  if (shared.status !== 'ok') return redirect({ href: `/see/${token}`, locale: await getLocale() })
  return <Printable trip={shared.trip} back={`/see/${token}`} />
}
