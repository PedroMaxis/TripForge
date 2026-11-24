import { getLocale, getTranslations } from 'next-intl/server'
import { AccountForm } from '@/components/account-form'
import { Header } from '@/components/header'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'

export default async function LandingPage() {
  if (await getSession()) redirect({ href: '/trips', locale: await getLocale() })
  const t = await getTranslations('Landing')

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-5xl text-balance">{t('title')}</h1>
        <p className="mt-4 mb-8 max-w-prose text-lg text-ink-2">{t('body')}</p>
        <AccountForm mode="signIn" />
      </main>
    </>
  )
}
