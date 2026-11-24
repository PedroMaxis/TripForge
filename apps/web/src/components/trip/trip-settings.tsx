'use client'

import { areTripDates, datesBetween, isDate, type Trip } from '@tripforge/core'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import type { TripFormError } from '@/lib/trips'
import { TripFields } from './trip-fields'

export function TripSettings({ trip }: { trip: Trip }) {
  const t = useTranslations('TripForm')
  const router = useRouter()
  const [dates, setDates] = useState({ startDate: trip.startDate, endDate: trip.endDate })
  const [error, setError] = useState<TripFormError | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)

  const valid = isDate(dates.startDate) && isDate(dates.endDate) && areTripDates(dates)
  const wanted = valid ? datesBetween(dates.startDate, dates.endDate) : null
  // With the same length the days move together, so none is lost.
  const removed =
    wanted && wanted.length !== trip.days.length
      ? trip.days.filter((d) => !wanted.includes(d.date)).length
      : 0

  async function update(fields: object, next: string) {
    setPending(true)
    setFailed(false)
    const res = await fetch(`/api/trips/${trip.id}/operations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ opId: crypto.randomUUID(), op: { type: 'trip.update', fields } }),
    }).catch(() => null)
    if (!res?.ok) {
      setFailed(true)
      setPending(false)
      return
    }
    router.push(next)
    router.refresh()
  }

  function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    if (!form.title?.trim()) return setError('title')
    if (!form.destination?.trim()) return setError('destination')
    if (!valid) return setError('dates')
    setError(null)
    void update(form, `/trips/${trip.id}`)
  }

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <form onSubmit={save} className="flex flex-col gap-5">
        <TripFields
          values={trip}
          error={error}
          onDates={(startDate, endDate) => setDates({ startDate, endDate })}
        />
        {removed > 0 && (
          <p role="status" className="rounded-xl bg-warm px-4 py-3">
            {t('removedDays', { count: removed })}
          </p>
        )}
        <p role="alert" className="text-danger empty:hidden">
          {failed && t('failed')}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {t('save')}
          </button>
          <Link href={`/trips/${trip.id}`} className="btn">
            {t('cancel')}
          </Link>
        </div>
      </form>
      {trip.role === 'owner' && (
        <section className="rounded-2xl bg-mist p-6">
          <h2 className="text-xl">{trip.archivedAt ? t('unarchiveTitle') : t('archiveTitle')}</h2>
          <p className="mt-2 text-ink-2">
            {trip.archivedAt ? t('unarchiveBody') : t('archiveBody')}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => update({ archived: !trip.archivedAt }, '/trips')}
            className="btn mt-4"
          >
            {trip.archivedAt ? t('unarchive') : t('archive')}
          </button>
        </section>
      )}
    </div>
  )
}
