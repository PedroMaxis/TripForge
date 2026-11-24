import { getLocale, getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { AppWindow } from '@/components/landing/app-window'
import { LandingStory } from '@/components/landing/landing-story'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'

const features = [
  ['f1', 'f1b'],
  ['f2', 'f2b'],
  ['f3', 'f3b'],
] as const

export default async function LandingPage() {
  const locale = await getLocale()
  if (await getSession()) redirect({ href: '/trips', locale })
  const t = await getTranslations('Landing')

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-20">
        <Header wide>
          <Link href="/sign-in" className="btn max-sm:hidden">
            {t('signIn')}
          </Link>
        </Header>
      </div>
      <main className="overflow-x-clip">
        <LandingStory />
        <div className="relative z-10 rounded-t-[2rem] bg-paper">
          <div className="mx-auto max-w-7xl px-4 pt-20 pb-24 sm:pt-28">
            <h2 className="mb-12 max-w-[18ch] text-4xl text-balance sm:text-6xl">
              {t('appTitle')}
            </h2>
            <AppWindow src={`/app-${locale}.webp`} alt={t('imageAlt')} credit={t('credit')} />
          </div>
          <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-28 md:grid-cols-3">
            {features.map(([title, body]) => (
              <section key={title}>
                <h3 className="text-2xl sm:text-3xl">{t(title)}</h3>
                <p className="mt-3 max-w-[38ch] text-ink-2">{t(body)}</p>
              </section>
            ))}
          </div>
          <div className="relative overflow-hidden bg-mist">
            <img
              src="/landing/relief.svg"
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
            <div className="relative mx-auto max-w-7xl px-4 py-28 sm:py-40">
              <h2 className="max-w-[16ch] text-5xl text-balance sm:text-7xl">{t('end')}</h2>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/sign-up" className="btn btn-primary">
                  {t('create')}
                </Link>
                <Link href="/sign-in" className="btn">
                  {t('signIn')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="relative z-10 bg-paper px-4 py-10 text-sm text-muted">
        <p className="mx-auto max-w-7xl">{t('credit')}</p>
      </footer>
    </>
  )
}
