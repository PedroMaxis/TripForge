import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { NewTripForm } from '@/components/trip/new-trip-form'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'

export default async function NewTripPage() {
  if (!(await getSession())) redirect({ href: '/', locale: await getLocale() })
  const t = await getTranslations('TripForm')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">
        <h1 className="mb-8 text-4xl">{t('newTitle')}</h1>
        <NewTripForm />
      </main>
    </>
  )
}
