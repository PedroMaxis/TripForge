import { getTrip } from '@tripforge/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { TripSettings } from '@/components/trip/trip-settings'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function TripSettingsPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const session = await getSession()
  if (!session) return redirect({ href: '/', locale: await getLocale() })
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  if (!trip || trip.role === 'viewer') notFound()
  const t = await getTranslations('TripForm')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">
        <h1 className="mb-8 text-4xl">{t('editTitle')}</h1>
        <TripSettings trip={trip} />
      </main>
    </>
  )
}
