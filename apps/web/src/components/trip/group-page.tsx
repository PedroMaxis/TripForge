'use client'

import type { Operation, Trip, TripGroup } from '@tripforge/core'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { Undo } from '@/lib/trip-store'
import { Revoked, SyncStatus, Toast } from './trip-status'
import { useRealtime } from './use-realtime'
import { type TripScreenProps, useTripStore } from './use-trip-store'

export type GroupPageProps = {
  trip: Trip
  group: TripGroup
  userId: string
  dispatch: (op: Operation, undo?: Undo) => void
}

/** A page of what the group shares, live like the itinerary. */
export function GroupPage({
  initial,
  userId,
  realtimeUrl,
  title,
  children,
}: TripScreenProps & {
  title: string
  children: (props: GroupPageProps) => React.ReactNode
}) {
  const { store, trip, sync, undo, notice, revoked, dispatch } = useTripStore(initial, userId)
  useRealtime({ tripId: initial.id, url: realtimeUrl, store, editing: null })
  const t = useTranslations('Group')
  if (revoked) return <Revoked />
  // The role changed to one that only looks.
  if (!trip.group) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="mb-8 text-3xl">{t('editorsOnly')}</h1>
        <Link href={`/trips/${trip.id}`} className="btn">
          {trip.title}
        </Link>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-24">
      <h1 className="text-4xl">{title}</h1>
      <p className="mt-2 mb-8 flex min-h-8 flex-wrap items-center gap-x-6 gap-y-2">
        <Link href={`/trips/${trip.id}`} className="text-accent underline underline-offset-4">
          {trip.title}
        </Link>
        <SyncStatus sync={sync} />
      </p>
      {children({ trip, group: trip.group, userId, dispatch })}
      <Toast undo={undo} notice={notice} canEdit dispatch={dispatch} />
    </main>
  )
}
