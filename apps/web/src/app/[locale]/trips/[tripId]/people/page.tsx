import { getTrip, listInvites } from '@tripforge/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { PeopleManager } from '@/components/trip/people-manager'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function PeoplePage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return redirect({ href: '/', locale: await getLocale() })
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  if (!trip) notFound()
  const invites = trip.role === 'owner' ? await listInvites(db(), session.user.id, trip.id) : []
  const t = await getTranslations('People')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">
        <h1 className="text-4xl">{t('title')}</h1>
        <p className="mt-2 mb-8">
          <Link href={`/trips/${trip.id}`} className="text-accent underline underline-offset-4">
            {trip.title}
          </Link>
        </p>
        <PeopleManager
          tripId={trip.id}
          isOwner={trip.role === 'owner'}
          selfId={session.user.id}
          members={trip.members}
          invites={invites.map((i) => ({
            id: i.id,
            role: i.role,
            expiresOn: i.expiresAt.toISOString().slice(0, 10),
          }))}
        />
      </main>
    </>
  )
}
