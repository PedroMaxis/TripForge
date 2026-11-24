import { getLocale, getTranslations } from 'next-intl/server'
import { AccountForm } from '@/components/account-form'
import { Header } from '@/components/header'
import { redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'

export default async function SignUpPage() {
  if (await getSession()) redirect({ href: '/trips', locale: await getLocale() })
  const t = await getTranslations('SignUp')

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-8 text-4xl font-semibold tracking-tight text-balance">{t('title')}</h1>
        <AccountForm mode="signUp" />
      </main>
    </>
  )
}
