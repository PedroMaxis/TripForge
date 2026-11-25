import { getTrip } from '@tripforge/db'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { Printable } from '@/components/trip/printable'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function PrintPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return redirect({ href: '/sign-in', locale: await getLocale() })
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  if (!trip) notFound()
  return <Printable trip={trip} back={`/trips/${trip.id}`} />
}
