'use client'

import type { Conflict, Trip, TripItem } from '@tripforge/core'
import { useTranslations } from 'next-intl'

const shownFields = [
  ['title', 'stopName'],
  ['kind', 'kind'],
  ['startTime', 'starts'],
  ['endTime', 'ends'],
  ['placeName', 'place'],
  ['address', 'address'],
  ['notes', 'notes'],
] as const satisfies [keyof TripItem, string][]

/** Edits made offline that lost to someone else's, with both versions to choose from. */
export function Conflicts({
  trip,
  conflicts,
  onSettle,
}: {
  trip: Trip
  conflicts: Conflict[]
  onSettle: (itemId: string, keep: 'mine' | 'theirs') => void
}) {
  const t = useTranslations('Trip')
  const value = (field: keyof TripItem, item: Partial<TripItem>) => {
    const v = item[field]
    if (field === 'kind' && item.kind) return t(`kinds.${item.kind}`)
    return v === null || v === undefined || v === '' ? t('conflict.empty') : String(v)
  }
  return conflicts.map((c) => {
    const title = trip.items.find((i) => i.id === c.itemId)?.title ?? ''
    return (
      <section
        key={c.itemId}
        aria-label={t('conflict.label', { title })}
        className="mx-2 mt-4 rounded-2xl bg-warm p-5"
      >
        <p>{t('conflict.body', { name: c.userName, title })}</p>
        <dl className="mt-3 grid gap-3">
          {shownFields
            .filter(([field]) => field in c.mine)
            .map(([field, label]) => (
              <div key={field}>
                <dt className="text-sm font-bold">{t(label)}</dt>
                <dd className="[overflow-wrap:anywhere]">
                  {t('conflict.mine')}: {value(field, c.mine)}
                </dd>
                <dd className="[overflow-wrap:anywhere]">
                  {c.userName}: {value(field, c.theirs)}
                </dd>
              </div>
            ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => onSettle(c.itemId, 'mine')}>
            {t('conflict.useMine')}
          </button>
          <button type="button" className="btn" onClick={() => onSettle(c.itemId, 'theirs')}>
            {t('conflict.keepTheirs', { name: c.userName })}
          </button>
        </div>
      </section>
    )
  })
}
