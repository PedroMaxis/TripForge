'use client'

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { Trip } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { Link } from '@/i18n/navigation'
import { formatDate, formatRange } from '@/lib/dates'
import { createTripStore, itemsOf, positionAt } from '@/lib/trip-store'
import { Logo } from '../logo'
import { AddItem } from './add-item'
import { AutoField } from './auto-field'
import { DayStrip, isLeg, legDay } from './day-strip'
import { People } from './people'
import { Stop } from './stop'

// Over the strip only the pointer counts; inside the list, the nearest row.
const collisions: CollisionDetection = (args) => {
  const overLeg = pointerWithin(args).filter((c) => isLeg(c.id))
  if (overLeg.length > 0) return overLeg
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => !isLeg(c.id)),
  })
}

export function TripScreen({
  initial,
  initialDayId,
}: {
  initial: Trip
  initialDayId: string | null
}) {
  const t = useTranslations('Trip')
  const locale = useLocale()
  const [store] = useState(() => createTripStore(initial))
  const { trip, sync, rejected, undo, dispatch, dismiss } = useStore(store)
  const [dayId, setDayId] = useState(initialDayId)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const canEdit = trip.role !== 'viewer'
  const day = trip.days.find((d) => d.id === dayId) ?? null
  const list = itemsOf(trip, dayId)
  const dragging = trip.items.find((i) => i.id === draggingId)

  useEffect(() => {
    if (!undo && !rejected) return
    const timer = setTimeout(dismiss, 7000)
    return () => clearTimeout(timer)
  }, [undo, rejected, dismiss])

  useEffect(() => {
    if (sync === 'saved') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [sync])

  function choose(next: string | null) {
    setDayId(next)
    setOpenId(null)
    const url = new URL(location.href)
    url.searchParams.set('day', trip.days.find((d) => d.id === next)?.date ?? 'ideas')
    history.replaceState(null, '', url)
  }

  function move(itemId: string, toDayId: string | null, index: number) {
    const item = trip.items.find((i) => i.id === itemId)
    if (!item) return
    dispatch(
      {
        type: 'item.move',
        itemId,
        dayId: toDayId,
        position: positionAt(trip, toDayId, index, itemId),
      },
      {
        kind: 'moved',
        title: item.title,
        op: { type: 'item.move', itemId, dayId: item.dayId, position: item.position },
      },
    )
  }

  function moveToDay(itemId: string, toDayId: string | null) {
    const item = trip.items.find((i) => i.id === itemId)
    if (!item || item.dayId === toDayId) return
    setOpenId(null)
    move(itemId, toDayId, itemsOf(trip, toDayId).length)
  }

  function drop({ active, over }: DragEndEvent) {
    setDraggingId(null)
    if (!over) return
    const itemId = String(active.id)
    if (isLeg(over.id)) return moveToDay(itemId, legDay(over.id))
    const index = list.findIndex((i) => i.id === over.id)
    if (index >= 0 && over.id !== active.id) move(itemId, dayId, index)
  }

  const dayName = (index: number) =>
    trip.days[index]?.title ?? t('dayNumber', { number: index + 1 })

  return (
    <DndContext
      id="trip"
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={({ active }) => {
        setOpenId(null)
        setDraggingId(String(active.id))
      }}
      onDragEnd={drop}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-center gap-3 px-4 py-2 md:gap-6 md:px-6">
          <Logo />
          <span
            data-testid="sync"
            data-state={sync}
            role="status"
            className={
              sync === 'offline'
                ? 'min-w-0 rounded-full bg-warm px-3 py-1 text-sm'
                : 'text-sm text-muted max-sm:sr-only'
            }
          >
            {canEdit ? t(sync) : null}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {!canEdit && (
              <span className="rounded-full bg-soft px-3 py-1 text-sm whitespace-nowrap">
                {t('viewOnly')}
              </span>
            )}
            <span className="max-sm:hidden">
              <People members={trip.members} />
            </span>
            {canEdit && (
              <Link href={`/trips/${trip.id}/settings`} className="btn">
                {t('settings')}
              </Link>
            )}
          </div>
        </header>

        <DayStrip
          trip={trip}
          current={dayId}
          dayName={dayName}
          onChoose={choose}
          className="md:row-start-3"
        />

        <main className="min-h-0 overflow-y-auto px-2 pb-24 md:row-start-2 md:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="mx-2 rounded-2xl bg-mist px-5 py-5 md:px-6 md:py-8">
              <h1 className="text-3xl md:text-4xl">{trip.title}</h1>
              <p className="mt-2 text-sm text-ink-2">
                {trip.destination}, {formatRange(trip.startDate, trip.endDate, locale)}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 pt-6 pb-3">
              <div className="min-w-0 flex-1 basis-48">
                {day && canEdit ? (
                  <h2 className="text-2xl">
                    <AutoField
                      key={day.id}
                      aria-label={t('dayName')}
                      value={day.title ?? ''}
                      placeholder={dayName(trip.days.indexOf(day))}
                      maxLength={120}
                      onSave={(title) =>
                        dispatch({ type: 'day.update', dayId: day.id, fields: { title } })
                      }
                      className="-mx-2 w-full rounded-lg px-2 placeholder:text-ink hover:bg-mist"
                    />
                  </h2>
                ) : (
                  <h2 className="text-2xl">{day ? dayName(trip.days.indexOf(day)) : t('ideas')}</h2>
                )}
                <p className="text-sm text-muted">
                  {day
                    ? formatDate(day.date, locale, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : t('ideasBody')}
                </p>
              </div>
              {canEdit && (
                <AddItem
                  key={dayId}
                  button={day ? t('addStop') : t('addIdea')}
                  label={day ? t('newStop') : t('newIdea')}
                  onAdd={(title) =>
                    dispatch({
                      type: 'item.create',
                      itemId: crypto.randomUUID(),
                      dayId,
                      position: positionAt(trip, dayId, list.length),
                      title,
                      kind: 'activity',
                    })
                  }
                />
              )}
            </div>

            {list.length === 0 ? (
              <div className="mx-2 rounded-2xl bg-mist px-6 py-10">
                <h3 className="text-xl">{day ? t('emptyDay') : t('emptyIdeas')}</h3>
                <p className="mt-2 text-ink-2">
                  {!canEdit ? t('emptyDayViewer') : day ? t('emptyDayBody') : t('emptyIdeasBody')}
                </p>
              </div>
            ) : (
              <SortableContext items={list} strategy={verticalListSortingStrategy}>
                <ol className="grid gap-0.5">
                  {list.map((item, index) => (
                    <Stop
                      key={item.id}
                      item={item}
                      number={day ? index + 1 : null}
                      days={trip.days}
                      dayName={dayName}
                      open={openId === item.id}
                      canEdit={canEdit}
                      onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                      onSave={(fields) =>
                        dispatch({
                          type: 'item.update',
                          itemId: item.id,
                          baseVersion: item.version,
                          fields,
                        })
                      }
                      onMove={(to) => moveToDay(item.id, to)}
                      onDelete={() =>
                        dispatch(
                          { type: 'item.delete', itemId: item.id },
                          {
                            kind: 'deleted',
                            title: item.title,
                            op: { type: 'item.restore', itemId: item.id },
                          },
                        )
                      }
                    />
                  ))}
                </ol>
              </SortableContext>
            )}
          </div>
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="rounded-2xl bg-paper px-5 py-4 font-display text-xl shadow-[0_6px_20px_oklch(29%_0.045_158/.16)]">
            {dragging.title}
          </div>
        )}
      </DragOverlay>

      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 md:bottom-36"
      >
        {(undo || rejected) && (
          <div className="pointer-events-auto flex min-h-12 max-w-full items-center gap-3 rounded-full bg-ink py-1 pr-1 pl-5 text-sm text-paper">
            <span className="min-w-0 truncate pr-3">
              {undo ? t(undo.kind, { title: undo.title }) : t('rejected')}
            </span>
            {undo && (
              <button
                type="button"
                onClick={() => dispatch(undo.op)}
                className="min-h-10 shrink-0 rounded-full bg-paper px-4 font-bold text-ink hover:bg-soft focus-visible:outline-paper"
              >
                {t('undo')}
              </button>
            )}
          </div>
        )}
      </div>
    </DndContext>
  )
}
