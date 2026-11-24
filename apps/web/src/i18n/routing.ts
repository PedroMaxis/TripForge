import { defaultLocale, locales } from '@tripforge/core'
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
})
