import { getTrip } from '@tripforge/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { cache } from 'react'
import { TripScreen } from '@/components/trip/trip-screen'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { todayIn } from '@/lib/dates'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

type Props = {
  params: Promise<{ tripId: string }>
  searchParams: Promise<{ day?: string }>
}

const load = cache(async (tripId: string) => {
  const session = await getSession()
  return { session, trip: session && (await getTrip(db(), session.user.id, tripId)) }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { trip } = await load((await params).tripId)
  return trip ? { title: trip.title } : {}
}

export default async function TripPage({ params, searchParams }: Props) {
  const { session, trip } = await load((await params).tripId)
  if (!session) return redirect({ href: '/', locale: await getLocale() })
  if (!trip) notFound()
  const { day } = await searchParams
  const today = todayIn(trip.timezone)
  const start =
    day === 'ideas'
      ? null
      : (trip.days.find((d) => d.date === day) ??
        trip.days.find((d) => d.date === today) ??
        trip.days[0])
  const { MAP_STYLE_URL, TERRAIN_URL } = env()
  return (
    <TripScreen
      initial={trip}
      initialDayId={start?.id ?? null}
      sources={{ styleUrl: MAP_STYLE_URL, terrainUrl: TERRAIN_URL }}
    />
  )
}
