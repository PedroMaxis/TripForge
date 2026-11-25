import { getLocale, getTranslations } from 'next-intl/server'
import { AccountForm } from '@/components/account-form'
import { Header } from '@/components/header'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { safeNext } from '@/lib/next-path'

type Props = { searchParams: Promise<{ next?: string | string[] }> }

export default async function SignUpPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next)
  if (await getSession()) redirect({ href: next ?? '/trips', locale: await getLocale() })
  const t = await getTranslations('SignUp')

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-8 text-5xl text-balance">{t('title')}</h1>
        <AccountForm mode="signUp" next={next} />
        <p className="mt-4 text-sm">
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            {t('privacy')}
          </Link>
        </p>
      </main>
    </>
  )
}
