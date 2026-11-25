import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { DeleteAccount, NameForm, PasswordForm } from '@/components/profile-forms'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'

export default async function AccountPage() {
  const session = await getSession()
  if (!session) return redirect({ href: '/sign-in', locale: await getLocale() })
  const t = await getTranslations('Profile')
  const link = 'text-accent underline underline-offset-4'
  return (
    <>
      <Header />
      <main className="mx-auto grid max-w-5xl gap-12 px-4 pt-6 pb-16">
        <div>
          <h1 className="text-4xl">{t('title')}</h1>
          <p className="mt-2">
            <Link href="/trips" className={link}>
              {t('back')}
            </Link>
          </p>
          <p className="mt-6 text-ink-2">{session.user.email}</p>
        </div>
        <section>
          <h2 className="mb-4 text-2xl">{t('name')}</h2>
          <NameForm name={session.user.name} />
        </section>
        <section>
          <h2 className="mb-4 text-2xl">{t('password')}</h2>
          <PasswordForm />
        </section>
        <section>
          <h2 className="mb-4 text-2xl">{t('data')}</h2>
          <p className="mb-4 max-w-prose text-ink-2">{t('dataBody')}</p>
          <p className="flex flex-wrap items-center gap-6">
            <a href="/api/account/export" className="btn">
              {t('export')}
            </a>
            <Link href="/privacy" className={link}>
              {t('privacy')}
            </Link>
          </p>
        </section>
        <section className="max-w-2xl rounded-2xl bg-mist p-6">
          <h2 className="text-2xl">{t('delete')}</h2>
          <p className="mt-3 mb-5 text-ink-2">{t('deleteBody')}</p>
          <DeleteAccount />
        </section>
      </main>
    </>
  )
}
