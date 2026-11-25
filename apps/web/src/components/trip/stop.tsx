'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  type ItemKind,
  itemKinds,
  type Operation,
  type TripDay,
  type TripItem,
} from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'
import { formatDate } from '@/lib/dates'
import type { Near } from '../place-search'
import { AutoField } from './auto-field'
import { GoLinks } from './go-links'
import { PlaceField } from './place-field'
import { type GroupTools, StopGroup } from './stop-group'

type Fields = Extract<Operation, { type: 'item.update' }>['fields']

const icons: Record<ItemKind, string> = {
  activity: 'M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10h18L12 4z',
  food: 'M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 3c-2 2-2 8 0 9v9',
  transport: 'M5 4h14v12H5zM5 11h14M8 19v-3M16 19v-3',
  lodging: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5',
  other:
    'M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
}

type Props = {
  item: TripItem
  /** Its place in the day; null for an idea. */
  number: number | null
  days: TripDay[]
  /** Who else has it open. */
  editor: string | null
  /** How to get here from the stop before. */
  travel: string | null
  /** Why it cannot be reached on time, already in words. */
  late: string | null
  near: Near
  /** What the group keeps about it; null for who only looks. */
  tools: GroupTools | null
  dayName: (index: number) => string
  open: boolean
  canEdit: boolean
  onToggle: () => void
  onSave: (fields: Fields) => void
  onMove: (dayId: string | null) => void
  onDelete: () => void
}

export function Stop(props: Props) {
  const { item, number, editor, travel, late, tools, open, canEdit, onToggle } = props
  const t = useTranslations('Trip')
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit })
  const row = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest' })
  }, [open])
  const when = item.startTime
    ? item.endTime
      ? t('range', { start: item.startTime, end: item.endTime })
      : item.startTime
    : null

  return (
    <li
      ref={(node) => {
        row.current = node
        setNodeRef(node)
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-2xl transition-colors ${open ? 'bg-mist' : 'hover:bg-mist'} ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-3 px-4">
        <span
          aria-hidden="true"
          className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium ${open ? 'bg-accent text-accent-ink' : 'bg-soft'}`}
        >
          {item.done && number ? '✓' : (number ?? '+')}
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="min-w-0 flex-1 rounded-lg py-3 text-left"
        >
          <span
            data-testid="stop-name"
            className="block font-display text-xl leading-tight [overflow-wrap:anywhere]"
          >
            {item.title}
            {item.done && <span className="sr-only"> {t('done')}</span>}
          </span>
          {(when || late || item.placeName) && (
            <span className="block text-sm text-ink-2 tabular-nums">
              {[when, item.placeName !== item.title && item.placeName].filter(Boolean).join(', ')}
              {late && <strong className="font-bold text-danger"> {late}</strong>}
            </span>
          )}
          {editor && (
            <span className="mt-1 inline-block rounded-full bg-warm px-2 py-0.5 text-xs font-medium">
              {t('editing', { name: editor })}
            </span>
          )}
          {tools && <Kept item={item} group={tools.group} />}
          {travel && <span className="block text-sm text-muted tabular-nums">{travel}</span>}
        </button>
        {tools && number === null && <VoteButton item={item} tools={tools} />}
        <span title={t(`kinds.${item.kind}`)} className="shrink-0 text-muted">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label={t(`kinds.${item.kind}`)}
          >
            <path d={icons[item.kind]} />
          </svg>
        </span>
        {canEdit && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('reorder', { title: item.title })}
            className="grid h-12 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:text-ink active:cursor-grabbing"
          >
            <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
              {[3, 9, 15].flatMap((y) => [
                <circle key={`l${y}`} cx="3" cy={y} r="1.7" />,
                <circle key={`r${y}`} cx="9" cy={y} r="1.7" />,
              ])}
            </svg>
          </button>
        )}
      </div>
      {open && (canEdit ? <StopForm {...props} /> : <StopDetails item={item} />)}
    </li>
  )
}

/** How much the group has kept about it. */
function Kept({ item, group }: { item: TripItem; group: GroupTools['group'] }) {
  const t = useTranslations('Group')
  const about = <T extends { itemId: string }>(list: T[]) =>
    list.filter((x) => x.itemId === item.id).length
  const booked = group.bookings.some((b) => b.itemId === item.id && (b.code || b.details))
  const files = about(group.attachments)
  const comments = about(group.comments)
  const parts = [
    booked && t('booked'),
    files > 0 && t('files', { count: files }),
    comments > 0 && t('comments', { count: comments }),
  ].filter(Boolean)
  if (parts.length === 0) return null
  return <span className="block text-sm text-muted">{parts.join(', ')}</span>
}

function VoteButton({ item, tools }: { item: TripItem; tools: GroupTools }) {
  const t = useTranslations('Group')
  const { group, userId, dispatch } = tools
  const votes = group.votes.filter((v) => v.itemId === item.id)
  const own = votes.some((v) => v.userId === userId)
  return (
    <button
      type="button"
      aria-pressed={own}
      aria-label={t('vote', { title: item.title, count: votes.length })}
      title={votes.map((v) => group.people[v.userId]).join(', ') || undefined}
      onClick={() => dispatch({ type: 'item.vote', itemId: item.id, on: !own })}
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums ${
        own ? 'bg-accent text-accent-ink' : 'bg-soft hover:bg-line'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 21C5 15.5 2 12 2 8a5 5 0 0 1 10-1.5A5 5 0 0 1 22 8c0 4-3 7.5-10 13z" />
      </svg>
      {votes.length}
    </button>
  )
}

function StopDetails({ item }: { item: TripItem }) {
  return (
    <div className="grid gap-2 px-4 pb-5 pl-[3.75rem]">
      {item.address && <p className="text-ink-2">{item.address}</p>}
      {item.notes && <p className="whitespace-pre-wrap">{item.notes}</p>}
      <GoLinks item={item} />
    </div>
  )
}

function StopForm({ item, days, dayName, near, tools, onSave, onMove, onDelete }: Props) {
  const t = useTranslations('Trip')
  const locale = useLocale()
  const id = useId()
  const label = 'text-sm font-medium'

  const text = (name: 'title' | 'address' | 'notes', caption: string, max: number) => (
    <div className={name === 'title' || name === 'notes' ? 'sm:col-span-2' : undefined}>
      <label htmlFor={`${id}-${name}`} className={label}>
        {caption}
      </label>
      <AutoField
        id={`${id}-${name}`}
        value={item[name] ?? ''}
        maxLength={max}
        required={name === 'title'}
        multiline={name === 'notes'}
        onSave={(value) => onSave({ [name]: value })}
        className="field mt-1"
      />
    </div>
  )

  const time = (name: 'startTime' | 'endTime', caption: string) => (
    <div>
      <label htmlFor={`${id}-${name}`} className={label}>
        {caption}
      </label>
      <AutoField
        id={`${id}-${name}`}
        type="time"
        value={item[name] ?? ''}
        disabled={name === 'endTime' && !item.startTime}
        onSave={(value) => onSave({ [name]: value || null })}
        className="field mt-1 disabled:opacity-55"
      />
    </div>
  )

  return (
    <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:pl-[3.75rem]">
      {text('title', t('stopName'), 200)}
      <div className="grid grid-cols-2 gap-4 sm:col-span-2">
        {time('startTime', t('starts'))}
        {time('endTime', t('ends'))}
      </div>
      <div>
        <label htmlFor={`${id}-place`} className={label}>
          {t('place')}
        </label>
        <PlaceField id={`${id}-place`} item={item} near={near} onSave={onSave} />
      </div>
      {text('address', t('address'), 300)}
      <div>
        <label htmlFor={`${id}-kind`} className={label}>
          {t('kind')}
        </label>
        <select
          id={`${id}-kind`}
          value={item.kind}
          onChange={(event) => onSave({ kind: event.target.value as ItemKind })}
          className="field mt-1"
        >
          {itemKinds.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-day`} className={label}>
          {t('moveTo')}
        </label>
        <select
          id={`${id}-day`}
          value={item.dayId ?? ''}
          onChange={(event) => onMove(event.target.value || null)}
          className="field mt-1"
        >
          <option value="">{t('ideas')}</option>
          {days.map((day, index) => {
            const date = formatDate(day.date, locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })
            return (
              <option key={day.id} value={day.id}>
                {day.title ? `${dayName(index)}, ${date}` : date}
              </option>
            )
          })}
        </select>
      </div>
      {text('notes', t('notes'), 5000)}
      {tools && <StopGroup item={item} tools={tools} />}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <GoLinks item={item} />
        {item.dayId && (
          <button type="button" className="btn" onClick={() => onSave({ done: !item.done })}>
            {item.done ? t('notBeenHere') : t('beenHere')}
          </button>
        )}
        <button type="button" className="btn" onClick={onDelete}>
          {t('delete')}
        </button>
      </div>
    </div>
  )
}
