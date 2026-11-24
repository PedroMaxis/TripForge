import { getLocale, getTranslations } from 'next-intl/server'
import { AccountForm } from '@/components/account-form'
import { Header } from '@/components/header'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { canSendMail } from '@/lib/mail'
import { safeNext } from '@/lib/next-path'

type Props = { searchParams: Promise<{ next?: string | string[] }> }

export default async function SignInPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next)
  if (await getSession()) redirect({ href: next ?? '/trips', locale: await getLocale() })
  const t = await getTranslations('SignIn')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-8 text-5xl text-balance">{t('title')}</h1>
        <AccountForm mode="signIn" next={next} canRecover={canSendMail()} />
      </main>
    </>
  )
}
