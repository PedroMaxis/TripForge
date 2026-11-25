import { type Leg, lateFor, legKey, type TripItem } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { formatDistance, formatDuration } from '@/lib/travel'

/** How to reach each stop of a day from the last one on the map, in words. */
export function useArrivals(list: TripItem[], isDay: boolean, legs: Record<string, Leg>) {
  const t = useTranslations('Trip')
  const locale = useLocale()
  let meters = 0
  let previous: TripItem | undefined
  const arrivals = list.map((item, index) => {
    const from = previous
    if (item.lat !== null) previous = item
    if (!isDay || index === 0) return { travel: null, late: null }
    const leg =
      from?.lat != null && from.lng !== null && item.lat !== null && item.lng !== null
        ? legs[legKey({ lat: from.lat, lng: from.lng }, { lat: item.lat, lng: item.lng })]
        : undefined
    meters += leg?.meters ?? 0
    const before = list[index - 1]
    const late = before && lateFor(before, item, leg && from === before ? leg.seconds : null)
    return {
      travel: leg
        ? t(`travel.${leg.mode}`, {
            time: formatDuration(leg.seconds),
            distance: formatDistance(leg.meters, locale),
          })
        : null,
      late: late ? t(`late.${late}`) : null,
    }
  })
  const total = meters > 0 ? t('byStreet', { distance: formatDistance(meters, locale) }) : null
  return { arrivals, total }
}
