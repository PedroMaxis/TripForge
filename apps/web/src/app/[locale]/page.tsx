import { getLocale, getTranslations } from 'next-intl/server'
import { AccountForm } from '@/components/account-form'
import { Header } from '@/components/header'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { canSendMail } from '@/lib/mail'
import { safeNext } from '@/lib/next-path'

type Props = { searchParams: Promise<{ next?: string | string[] }> }

export default async function LandingPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next)
  if (await getSession()) redirect({ href: next ?? '/trips', locale: await getLocale() })
  const t = await getTranslations('Landing')

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-5xl text-balance">{t('title')}</h1>
        <p className="mt-4 mb-8 max-w-prose text-lg text-ink-2">{t('body')}</p>
        <AccountForm mode="signIn" next={next} canRecover={canSendMail()} />
      </main>
    </>
  )
}
