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

  const locale = await getLocale()
  const features = [
    ['f1', 'f1b'],
    ['f2', 'f2b'],
    ['f3', 'f3b'],
  ] as const

  return (
    <>
      <Header wide />
      <main className="overflow-x-clip">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-8 pb-16 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:pt-12">
          <div>
            <h1 className="text-5xl text-balance">{t('title')}</h1>
            <p className="mt-4 mb-8 max-w-prose text-lg text-ink-2">{t('body')}</p>
            <AccountForm mode="signIn" next={next} canRecover={canSendMail()} />
          </div>
          <figure>
            <img
              src={`/app-${locale}.webp`}
              width={1600}
              height={1000}
              alt={t('imageAlt')}
              className="h-auto w-full rounded-2xl border border-line"
            />
            <figcaption className="mt-2 text-xs text-muted">{t('credit')}</figcaption>
          </figure>
        </div>
        <div className="bg-mist">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-3">
            {features.map(([title, body]) => (
              <section key={title}>
                <h2 className="text-2xl">{t(title)}</h2>
                <p className="mt-3 max-w-prose text-ink-2">{t(body)}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
