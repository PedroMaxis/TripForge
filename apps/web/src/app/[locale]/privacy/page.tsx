import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'

const sections = ['kept', 'seen', 'cookies', 'others', 'backups', 'choices', 'contact'] as const

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('Privacy'))('title') }
}

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-20">
        <h1 className="text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-prose text-lg text-ink-2">{t('intro')}</p>
        {sections.map((key) => (
          <section key={key} className="mt-10">
            <h2 className="text-2xl">{t(`${key}.title`)}</h2>
            <p className="mt-2 max-w-prose">
              {t.rich(`${key}.body`, {
                link: (text) => (
                  <a
                    href="https://github.com/PedroMaxis/TripForge/issues"
                    className="text-accent underline underline-offset-4"
                  >
                    {text}
                  </a>
                ),
              })}
            </p>
          </section>
        ))}
      </main>
    </>
  )
}
