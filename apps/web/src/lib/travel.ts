/** Hours and minutes, the way people say it: "13 min", "4 h 21 min". */
export function formatDuration(seconds: number) {
  const total = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return [hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ')
}

/** Kilometers; past a hundred, the tenths say nothing. */
export function formatDistance(meters: number, locale: string) {
  const km = meters / 1000
  const digits = km < 100 ? 1 : 0
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(km)
}
