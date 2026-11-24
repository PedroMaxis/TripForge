import type { Metadata, Viewport } from 'next'
import { Manrope, Marcellus } from 'next/font/google'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { ServiceWorker } from '@/components/service-worker'
import { routing } from '@/i18n/routing'
import '../globals.css'

const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope' })
const marcellus = Marcellus({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  variable: '--font-marcellus',
})

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> }

export const viewport: Viewport = { themeColor: '#ffffff', viewportFit: 'cover' }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta')
  return {
    title: { default: 'TripForge', template: '%s, TripForge' },
    description: t('description'),
    applicationName: 'TripForge',
    appleWebApp: { title: 'TripForge', statusBarStyle: 'default' },
    icons: { icon: '/icon.svg', apple: '/icons/apple-180.png' },
  }
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  return (
    <html lang={locale} className={`${manrope.variable} ${marcellus.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
