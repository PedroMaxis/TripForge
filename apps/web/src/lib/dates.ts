import { parseDate } from '@tripforge/core'

// Node and browsers disagree on which thin space to use, and React would notice.
const plainSpaces = (text: string) => text.replace(/\s/g, ' ')

/** Formats a calendar date. Always in UTC, which is how such dates are parsed. */
export function formatDate(iso: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(parseDate(iso)),
  )
}

export function formatRange(start: string, end: string, locale: string) {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).formatRange(
      parseDate(start),
      parseDate(end),
    ),
  )
}

/** Today's date on the wall calendar of a timezone. */
export function todayIn(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}
