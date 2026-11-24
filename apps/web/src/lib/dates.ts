import { parseDate } from '@tripforge/core'

/** Formats a calendar date. Always in UTC, which is how such dates are parsed. */
export function formatDate(iso: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(parseDate(iso))
}

export function formatRange(start: string, end: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).formatRange(
    parseDate(start),
    parseDate(end),
  )
}

/** Today's date on the wall calendar of a timezone. */
export function todayIn(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}
