import { getSharedTrip, tripAccess } from '@tripforge/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'
import { SharedTrip } from '@/components/trip/shared-trip'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { formatRange, todayIn } from '@/lib/dates'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { acceptInviteAction } from '@/lib/sharing'

type Props = { params: Promise<{ token: string }> }

const load = cache((token: string) => getSharedTrip(db(), token))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shared = await load((await params).token)
  const hidden: Metadata = { robots: { index: false }, referrer: 'no-referrer' }
  if (shared.status !== 'ok') return hidden
  const { title, destination, startDate, endDate } = shared.trip
  const description = `${destination}, ${formatRange(startDate, endDate, await getLocale())}`
  // What a chat shows when the link is pasted.
  return { ...hidden, title, description, openGraph: { title, description, siteName: 'TripForge' } }
}

export default async function SharedTripPage({ params }: Props) {
  const { token } = await params
  const shared = await load(token)
  if (shared.status === 'unknown') notFound()
  const locale = await getLocale()
  const t = await getTranslations('Invite')
  if (shared.status !== 'ok') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl">{t(`gone.${shared.status}`)}</h1>
        <p className="mt-4 text-lg text-ink-2">{t('gone.ask')}</p>
      </main>
    )
  }

  const { trip } = shared
  const session = await getSession()
  if (session && (await tripAccess(db(), session.user.id, trip.id))) {
    redirect({ href: `/trips/${trip.id}`, locale })
  }
  const today = todayIn(trip.timezone)
  const start = trip.days.find((d) => d.date === today) ?? trip.days[0]
  const { MAP_STYLE_URL, TERRAIN_URL } = env()
  return (
    <SharedTrip
      initial={trip}
      initialDayId={start?.id ?? null}
      token={token}
      sources={{ styleUrl: MAP_STYLE_URL, terrainUrl: TERRAIN_URL }}
      action={
        session ? (
          <form action={acceptInviteAction.bind(null, token, locale)}>
            <button type="submit" className="btn">
              {t('keep')}
            </button>
          </form>
        ) : undefined
      }
    />
  )
}
