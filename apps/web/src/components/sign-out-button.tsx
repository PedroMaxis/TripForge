'use client'

import { useLocale, useTranslations } from 'next-intl'
import { signOut } from '@/lib/actions'
import { forgetTrips } from '@/lib/offline-trips'

export function SignOutButton() {
  const t = useTranslations('Trips')
  const locale = useLocale()
  return (
    <form
      action={async () => {
        await forgetTrips()
        await signOut(locale)
      }}
    >
      <button type="submit" className="min-h-11 text-sm text-ink-2 hover:text-ink">
        {t('signOut')}
      </button>
    </form>
  )
}
