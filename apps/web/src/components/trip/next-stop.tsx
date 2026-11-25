import type { TripItem } from '@tripforge/core'
import { useTranslations } from 'next-intl'
import { GoLinks } from './go-links'

/** While the trip is on: where to be, and the way there. */
export function NextStop({
  item,
  time,
  onOpen,
  onDone,
}: {
  item: TripItem
  time: string
  onOpen: () => void
  /** Only for who may change the trip. */
  onDone?: () => void
}) {
  const t = useTranslations('Trip')
  const here = item.startTime !== null && item.startTime <= time
  const where = item.placeName !== item.title ? item.placeName : item.address
  return (
    <section aria-label={t('today')} className="mx-2 mt-3 rounded-2xl bg-soft px-5 py-4">
      <h2 className="font-sans text-sm font-medium text-ink-2">{here ? t('now') : t('next')}</h2>
      <button type="button" onClick={onOpen} className="mt-1 block w-full rounded-lg text-left">
        <span className="block font-display text-2xl leading-tight [overflow-wrap:anywhere]">
          {item.title}
        </span>
        <span className="block text-ink-2 tabular-nums">
          {[
            item.startTime && item.endTime
              ? t('range', { start: item.startTime, end: item.endTime })
              : item.startTime,
            where,
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
      </button>
      <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
        <GoLinks item={item} />
        {onDone && (
          <button type="button" className="btn" onClick={onDone}>
            {t('beenHere')}
          </button>
        )}
      </div>
    </section>
  )
}
