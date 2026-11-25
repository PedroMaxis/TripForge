import { shiftDate } from '@tripforge/core'
import { getTrip } from '@tripforge/db'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { DuplicateForm } from '@/components/trip/duplicate-form'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { todayIn } from '@/lib/dates'
import { db } from '@/lib/db'

export default async function DuplicatePage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return redirect({ href: '/sign-in', locale: await getLocale() })
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  if (!trip) notFound()
  const t = await getTranslations('Duplicate')
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
        <p className="mb-6 max-w-lg text-ink-2">{t('body', { count: trip.days.length })}</p>
        <DuplicateForm
          tripId={trip.id}
          title={t('copyOf', { title: trip.title }).slice(0, 120)}
          startDate={shiftDate(todayIn(trip.timezone), 30)}
        />
      </main>
    </>
  )
}
