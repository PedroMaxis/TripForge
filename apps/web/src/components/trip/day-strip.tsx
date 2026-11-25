'use client'

import { type UniqueIdentifier, useDroppable } from '@dnd-kit/core'
import type { Trip } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { formatDate } from '@/lib/dates'
import { itemsOf } from '@/lib/trip-store'

const prefix = 'leg:'
const ideas = 'ideas'
export const isLeg = (id: UniqueIdentifier) => String(id).startsWith(prefix)
export function legDay(id: UniqueIdentifier) {
  const day = String(id).slice(prefix.length)
  return day === ideas ? null : day
}

export function DayStrip({
  trip,
  current,
  dayName,
  onChoose,
  ideas: withIdeas = true,
  className,
}: {
  trip: Trip
  current: string | null
  dayName: (index: number) => string
  onChoose: (dayId: string | null) => void
  ideas?: boolean
  className: string
}) {
  const t = useTranslations('Trip')
  const locale = useLocale()
  return (
    <nav
      aria-label={t('days')}
      className={`flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:thin] ${className}`}
    >
      {trip.days.map((day, index) => (
        <Leg
          key={day.id}
          dayId={day.id}
          current={current === day.id}
          onChoose={onChoose}
          top={`${formatDate(day.date, locale, { weekday: 'short' }).replace('.', '')} ${Number(day.date.slice(8))}`}
          name={dayName(index)}
          bottom={t('stops', { count: itemsOf(trip, day.id).length })}
        />
      ))}
      {withIdeas && (
        <Leg
          dayId={null}
          current={current === null}
          onChoose={onChoose}
          top={t('noDay')}
          name={t('ideas')}
          bottom={t('kept', { count: itemsOf(trip, null).length })}
        />
      )}
    </nav>
  )
}

function Leg({
  dayId,
  current,
  top,
  name,
  bottom,
  onChoose,
}: {
  dayId: string | null
  current: boolean
  top: string
  name: string
  bottom: string
  onChoose: (dayId: string | null) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: prefix + (dayId ?? ideas) })
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])
  const look = isOver
    ? 'bg-accent text-accent-ink'
    : current
      ? 'bg-soft text-ink'
      : 'text-ink hover:bg-mist'
  return (
    <button
      type="button"
      ref={(node) => {
        ref.current = node
        setNodeRef(node)
      }}
      onClick={() => onChoose(dayId)}
      aria-current={current ? 'true' : undefined}
      className={`grid min-w-32 flex-1 basis-32 gap-0.5 rounded-2xl px-4 py-2.5 text-left text-sm transition-colors ${look}`}
    >
      <span className="opacity-80">{top}</span>
      <span className="truncate font-display text-xl leading-tight">{name}</span>
      <span className="opacity-80">{bottom}</span>
    </button>
  )
}
