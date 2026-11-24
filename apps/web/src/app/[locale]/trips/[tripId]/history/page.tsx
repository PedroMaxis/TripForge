import { getTrip, recentLog } from '@tripforge/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { historyLines } from '@/lib/history'

type Props = {
  params: Promise<{ tripId: string }>
  searchParams: Promise<{ day?: string | string[] }>
}

export default async function HistoryPage({ params, searchParams }: Props) {
  const locale = await getLocale()
  const session = await getSession()
  if (!session) return redirect({ href: '/sign-in', locale })
  const { tripId } = await params
  const trip = await getTrip(db(), session.user.id, tripId)
  const entries = trip && (await recentLog(db(), session.user.id, tripId))
  if (!trip || !entries) notFound()
  const t = await getTranslations('History')

  const { day } = await searchParams
  const chosen = trip.days.find((d) => d.date === day)
  const lines = historyLines(entries, trip, day === 'ideas' ? null : chosen?.id)
  const dayName = (id: string | null | undefined) => {
    const index = trip.days.findIndex((d) => d.id === id)
    return index < 0
      ? t('ideas')
      : (trip.days[index]?.title ?? t('dayNumber', { number: index + 1 }))
  }
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: trip.timezone,
  })

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
        <form className="mb-6 flex max-w-sm items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="history-day" className="text-sm font-medium">
              {t('filter')}
            </label>
            <select
              id="history-day"
              name="day"
              defaultValue={day === 'ideas' ? 'ideas' : (chosen?.date ?? '')}
              className="field mt-1"
            >
              <option value="">{t('allDays')}</option>
              {trip.days.map((d) => (
                <option key={d.id} value={d.date}>
                  {dayName(d.id)}
                </option>
              ))}
              <option value="ideas">{t('ideas')}</option>
            </select>
          </div>
          <button type="submit" className="btn">
            {t('show')}
          </button>
        </form>
        {lines.length === 0 ? (
          <p className="rounded-2xl bg-mist px-6 py-10">{t('empty')}</p>
        ) : (
          <ol className="grid max-w-2xl gap-1">
            {lines.map((line) => (
              <li key={line.revision} className="rounded-2xl px-4 py-2 hover:bg-mist">
                <span className="[overflow-wrap:anywhere]">
                  {t(`entries.${line.key}`, {
                    name: line.name,
                    title: line.title,
                    other: line.other,
                    day: dayName(line.dayId),
                  })}
                </span>
                <time dateTime={line.at} className="block text-sm text-muted">
                  {when.format(new Date(line.at))}
                </time>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  )
}
