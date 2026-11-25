import { type Trip, tripLegs } from '@tripforge/core'
import { findLegs } from '@tripforge/db'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { formatDate, formatRange } from '@/lib/dates'
import { db } from '@/lib/db'
import { itemsOf } from '@/lib/trip-items'
import { PrintButton } from './print-button'
import { useArrivals } from './use-arrivals'

/** The whole itinerary on plain paper, for people who would rather not use a screen. */
export async function Printable({ trip, back }: { trip: Trip; back: string }) {
  const keys = tripLegs(trip.items).map((l) => l.key)
  const legs = await findLegs(db(), keys)
  return <Pages trip={trip} back={back} legs={legs} />
}

type Legs = Awaited<ReturnType<typeof findLegs>>

function Pages({ trip, back, legs }: { trip: Trip; back: string; legs: Legs }) {
  const t = useTranslations('Trip')
  const locale = useLocale()
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16 print:max-w-none print:p-0">
      <p className="mb-8 flex flex-wrap items-center gap-4 print:hidden">
        <PrintButton>{t('printNow')}</PrintButton>
        <Link href={back} className="text-accent underline underline-offset-4">
          {t('backToTrip')}
        </Link>
      </p>
      <h1 className="text-4xl">{trip.title}</h1>
      <p className="mt-2 text-lg text-ink-2">
        {trip.destination}, {formatRange(trip.startDate, trip.endDate, locale)}
      </p>
      {trip.days.map((day, index) => (
        <PrintedDay
          key={day.id}
          heading={day.title ?? t('dayNumber', { number: index + 1 })}
          date={formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          items={itemsOf(trip, day.id)}
          legs={legs}
        />
      ))}
    </main>
  )
}

function PrintedDay({
  heading,
  date,
  items,
  legs,
}: {
  heading: string
  date: string
  items: Trip['items']
  legs: Legs
}) {
  const t = useTranslations('Trip')
  const { arrivals } = useArrivals(items, true, legs)
  const hasTimes = items.some((i) => i.startTime)
  return (
    <section className="mt-10 break-inside-avoid-page">
      <h2 className="break-after-avoid text-2xl">{heading}</h2>
      <p className="mb-4 break-after-avoid text-ink-2">{date}</p>
      {items.length === 0 ? (
        <p className="text-ink-2">{t('emptyDay')}</p>
      ) : (
        <ol className="grid gap-4">
          {items.map((item, index) => (
            <li key={item.id} className="flex break-inside-avoid gap-4">
              {hasTimes && (
                <span className="w-28 shrink-0 tabular-nums">
                  {item.startTime &&
                    (item.endTime
                      ? t('range', { start: item.startTime, end: item.endTime })
                      : item.startTime)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl leading-tight">{item.title}</span>
                {[item.placeName !== item.title && item.placeName, item.address]
                  .filter(Boolean)
                  .join(', ')}
                {arrivals[index]?.travel && (
                  <span className="block text-sm text-ink-2">{arrivals[index].travel}</span>
                )}
                {item.notes && <span className="mt-1 block whitespace-pre-wrap">{item.notes}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
