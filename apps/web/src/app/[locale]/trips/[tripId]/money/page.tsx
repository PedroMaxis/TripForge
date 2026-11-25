import { getTrip } from '@tripforge/db'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { Header } from '@/components/header'
import { MoneyScreen } from '@/components/trip/money-screen'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export default async function MoneyPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return redirect({ href: '/sign-in', locale: await getLocale() })
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  if (!trip?.group) notFound()
  return (
    <>
      <Header />
      <MoneyScreen initial={trip} userId={session.user.id} realtimeUrl={env().REALTIME_URL} />
    </>
  )
}
