import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { redirect } from '@/i18n/navigation'
import { signOut } from '@/lib/actions'
import { getSession } from '@/lib/auth'

export default async function TripsPage() {
  const locale = await getLocale()
  const session = await getSession()
  if (!session) return redirect({ href: '/', locale })
  const t = await getTranslations('Trips')

  return (
    <>
      <Header>
        <span className="text-sm">{session.user.name}</span>
        <form action={signOut.bind(null, locale)}>
          <button type="submit" className="cursor-pointer py-2 text-sm text-muted hover:text-fg">
            {t('signOut')}
          </button>
        </form>
      </Header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="mt-1 text-muted">{t('emptyBody')}</p>
        </div>
      </main>
    </>
  )
}
