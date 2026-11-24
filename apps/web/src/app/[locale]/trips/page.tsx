import type { TripSummary } from '@tripforge/core'
import { listTrips } from '@tripforge/db'
import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { Cover } from '@/components/trip/cover'
import { People } from '@/components/trip/people'
import { Link, redirect } from '@/i18n/navigation'
import { signOut } from '@/lib/actions'
import { getSession } from '@/lib/auth'
import { formatRange, todayIn } from '@/lib/dates'
import { db } from '@/lib/db'

function TripCard({ trip, locale }: { trip: TripSummary; locale: string }) {
  return (
    <li>
      <Link href={`/trips/${trip.id}`} className="group block rounded-2xl">
        <Cover
          trip={trip}
          className="flex min-h-44 flex-col justify-between gap-6 rounded-2xl p-6 group-hover:bg-soft"
        >
          <span>
            <span className="block font-display text-2xl leading-tight [overflow-wrap:anywhere]">
              {trip.title}
            </span>
            <span className="mt-1 block text-ink-2">{trip.destination}</span>
          </span>
          <span className="flex items-end justify-between gap-4 text-sm text-ink-2">
            {formatRange(trip.startDate, trip.endDate, locale)}
            <People members={trip.members} />
          </span>
        </Cover>
      </Link>
    </li>
  )
}

export default async function TripsPage() {
  const locale = await getLocale()
  const session = await getSession()
  if (!session) return redirect({ href: '/', locale })
  const t = await getTranslations('Trips')
  const trips = await listTrips(db(), session.user.id)
  // Without a trip in hand there is no better clock than UTC to split past from upcoming.
  const today = todayIn('UTC')
  const active = trips.filter((trip) => !trip.archivedAt)
  const groups = [
    { key: 'upcoming', list: active.filter((trip) => trip.endDate >= today) },
    { key: 'past', list: active.filter((trip) => trip.endDate < today).reverse() },
    { key: 'archived', list: trips.filter((trip) => trip.archivedAt) },
  ] as const

  return (
    <>
      <Header>
        <span className="text-sm">{session.user.name}</span>
        <form action={signOut.bind(null, locale)}>
          <button type="submit" className="min-h-11 text-sm text-ink-2 hover:text-ink">
            {t('signOut')}
          </button>
        </form>
      </Header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl">{t('title')}</h1>
          {trips.length > 0 && (
            <Link href="/trips/new" className="btn btn-primary">
              {t('new')}
            </Link>
          )}
        </div>
        {trips.length === 0 && (
          <div className="mt-8 rounded-2xl bg-mist px-6 py-14">
            <p className="font-display text-2xl">{t('emptyTitle')}</p>
            <p className="mt-2 mb-6 text-ink-2">{t('emptyBody')}</p>
            <Link href="/trips/new" className="btn btn-primary">
              {t('new')}
            </Link>
          </div>
        )}
        {groups.map(
          ({ key, list }) =>
            list.length > 0 && (
              <section key={key} className="mt-10">
                <h2 className="mb-4 text-xl">{t(key)}</h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {list.map((trip) => (
                    <TripCard key={trip.id} trip={trip} locale={locale} />
                  ))}
                </ul>
              </section>
            ),
        )}
      </main>
    </>
  )
}
