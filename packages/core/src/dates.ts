const day = 86_400_000
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10)

// Plain calendar dates, always handled in UTC so no timezone or daylight saving can move them.
export const parseDate = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

export function isDate(iso: string) {
  const time = parseDate(iso)
  return !Number.isNaN(time) && toIso(time) === iso
}

export const shiftDate = (iso: string, days: number) => toIso(parseDate(iso) + days * day)

export const daysApart = (from: string, to: string) =>
  Math.round((parseDate(to) - parseDate(from)) / day)

export function datesBetween(start: string, end: string) {
  return Array.from({ length: daysApart(start, end) + 1 }, (_, i) => shiftDate(start, i))
}
