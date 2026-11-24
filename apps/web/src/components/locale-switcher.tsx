'use client'

import type { Locale } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const names: Record<Locale, string> = { en: 'English', 'pt-BR': 'Português' }

export function LocaleSwitcher() {
  const current = useLocale()
  const pathname = usePathname()
  const t = useTranslations('LocaleSwitcher')
  return (
    <nav aria-label={t('label')} className="flex gap-1 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? 'true' : undefined}
          className="rounded-full px-3 py-2 text-ink-2 hover:bg-mist aria-[current]:bg-soft aria-[current]:text-ink"
        >
          {names[locale]}
        </Link>
      ))}
    </nav>
  )
}
