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
import { nextStop, type Place, positionBetween, shorterOrder, type Trip } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { formatDate, formatRange } from '@/lib/dates'
import { formatDistance } from '@/lib/travel'
import { itemsOf, positionAt } from '@/lib/trip-store'
import { Logo } from '../logo'
import type { Near } from '../place-search'
import { AddItem } from './add-item'
import { AutoField } from './auto-field'
import { Conflicts } from './conflicts'
import { Cover } from './cover'
import { DayStrip, isLeg, legDay } from './day-strip'
import { NextStop } from './next-stop'
import { People } from './people'
import { Stop } from './stop'
import { type MapSources, TripMap } from './trip-map'
import { TripNav } from './trip-nav'
import { Revoked, SyncStatus, Toast } from './trip-status'
import { useArrivals } from './use-arrivals'
import { useLegs } from './use-legs'
import { useNow } from './use-now'
import { useRealtime } from './use-realtime'
import { useTripStore } from './use-trip-store'
import { useWeather } from './use-weather'
import { Weather } from './weather'

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
  userId,
  realtimeUrl,
  sources,
}: {
  initial: Trip
  initialDayId: string | null
  userId: string
  realtimeUrl: string | undefined
  sources: MapSources
}) {
  const t = useTranslations('Trip')
  const locale = useLocale()
  const { store, trip, sync, undo, notice, conflicts, revoked, watch, settle, dispatch, catchUp } =
    useTripStore(initial, userId)
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

  useEffect(() => watch(openId), [watch, openId])
  const present = useRealtime({
    tripId: trip.id,
    url: realtimeUrl,
    store,
    editing: canEdit ? openId : null,
  })
  const online = new Set(present.map((p) => p.userId))
  const editorOf = (itemId: string) =>
    present.find((p) => p.editing === itemId && p.userId !== userId)?.name ?? null

  const page = `/trips/${trip.id}`
  const source = `/api${page}`
  const legs = useLegs(trip, sync === 'saved', source)
  const weather = useWeather(source)
  const now = useNow(trip.timezone)
  const today = now && trip.days.find((d) => d.date === now.date)
  const next = now && today ? nextStop(itemsOf(trip, today.id), now.time) : null
  const { destinationLat, destinationLng } = trip
  const near = useMemo<Near>(
    () =>
      destinationLat !== null && destinationLng !== null
        ? { lat: destinationLat, lng: destinationLng }
        : null,
    [destinationLat, destinationLng],
  )
  const hasMap = near !== null || trip.items.some((i) => i.lat !== null)

  const { arrivals, total } = useArrivals(list, day !== null, legs)
  const tools = trip.group && {
    tripId: trip.id,
    group: trip.group,
    userId,
    isOwner: trip.role === 'owner',
    timezone: trip.timezone,
    dispatch,
    onUploaded: () => void catchUp(),
  }
  const shorter = useMemo(
    () => (canEdit && dayId ? shorterOrder(itemsOf(trip, dayId)) : null),
    [canEdit, trip, dayId],
  )

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

  function shorten() {
    if (!day || !shorter) return
    let position: string | null = null
    const items = shorter.ids.map((itemId) => {
      position = positionBetween(position, null)
      return { itemId, position }
    })
    dispatch(
      { type: 'day.order', dayId: day.id, items },
      {
        kind: 'ordered',
        title: dayName(trip.days.indexOf(day)),
        op: {
          type: 'day.order',
          dayId: day.id,
          items: list.map(({ id: itemId, position }) => ({ itemId, position })),
        },
      },
    )
  }

  function drop({ active, over }: DragEndEvent) {
    setDraggingId(null)
    if (!over) return
    const itemId = String(active.id)
    if (isLeg(over.id)) return moveToDay(itemId, legDay(over.id))
    const index = list.findIndex((i) => i.id === over.id)
    if (index >= 0 && over.id !== active.id) move(itemId, dayId, index)
  }

  if (revoked) return <Revoked />

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
      <div
        className={`grid h-dvh grid-cols-[minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)_auto] ${
          hasMap
            ? 'grid-rows-[auto_34dvh_auto_minmax(0,1fr)] md:grid-cols-[minmax(380px,464px)_minmax(0,1fr)]'
            : 'grid-rows-[auto_auto_minmax(0,1fr)]'
        }`}
      >
        <header className="col-span-full flex items-center gap-2 px-4 py-2 md:gap-6 md:px-6">
          <span className="max-md:hidden">
            <Logo />
          </span>
          <Link
            href="/trips"
            aria-label={t('allTrips')}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-mist md:hidden"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path
                d="M10 3 5 8l5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <p className="min-w-0 truncate font-display text-xl md:hidden" aria-hidden="true">
            {trip.title}
          </p>
          <SyncStatus sync={sync} quiet={!canEdit} />
          <TripNav
            tripId={trip.id}
            group={trip.group !== null}
            canEdit={canEdit}
            className="md:ml-auto"
          />
          <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
            {!canEdit && (
              <span className="rounded-full bg-soft px-3 py-1 text-sm whitespace-nowrap">
                {t('viewOnly')}
              </span>
            )}
            <span className="max-lg:hidden">
              <People members={trip.members} online={online} />
            </span>
            {trip.role === 'owner' && (
              <Link href={`/trips/${trip.id}/people`} className="btn btn-primary">
                {t('invite')}
              </Link>
            )}
          </div>
        </header>

        {hasMap && (
          <TripMap
            {...sources}
            trip={trip}
            dayId={dayId}
            openId={openId}
            legs={legs}
            onPick={(itemId, itemDayId) => {
              if (itemDayId !== dayId) choose(itemDayId)
              setOpenId(itemDayId === dayId && itemId === openId ? null : itemId)
            }}
            className="md:col-start-2 md:row-start-2 md:mr-4 md:rounded-3xl"
          />
        )}

        <DayStrip
          trip={trip}
          current={dayId}
          dayName={dayName}
          onChoose={choose}
          className="col-span-full md:row-start-3"
        />

        <main
          className={`min-h-0 overflow-y-auto px-2 pb-24 md:col-start-1 md:row-start-2 ${hasMap ? '' : 'md:px-6'}`}
        >
          <div className="mx-auto max-w-3xl">
            <Cover trip={trip} className="mx-2 rounded-2xl px-5 py-5 md:px-6 md:pt-12 md:pb-6">
              <h1 className="text-3xl md:text-4xl">{trip.title}</h1>
              <p className="mt-2 text-sm text-ink-2">
                {trip.destination}, {formatRange(trip.startDate, trip.endDate, locale)}
              </p>
              <div className="mt-3 lg:hidden">
                <People members={trip.members} online={online} />
              </div>
            </Cover>
            {now && next && (
              <NextStop
                item={next}
                time={now.time}
                onOpen={() => {
                  if (next.dayId !== dayId) choose(next.dayId)
                  setOpenId(next.id)
                }}
                onDone={
                  canEdit
                    ? () =>
                        dispatch({
                          type: 'item.update',
                          itemId: next.id,
                          baseVersion: next.version,
                          fields: { done: true },
                        })
                    : undefined
                }
              />
            )}
            <Conflicts trip={trip} conflicts={conflicts} onSettle={settle} />

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
                  {total && `, ${total}`}
                </p>
                <Weather weather={day ? weather[day.date] : undefined} />
              </div>
              {canEdit && (
                <AddItem
                  key={dayId}
                  button={day ? t('addStop') : t('addIdea')}
                  label={day ? t('newStop') : t('newIdea')}
                  placeholder={t('newItemPlaceholder')}
                  hint={t('newItemHint')}
                  near={near}
                  onAdd={(title, place?: Place) =>
                    dispatch({
                      type: 'item.create',
                      itemId: crypto.randomUUID(),
                      dayId,
                      position: positionAt(trip, dayId, list.length),
                      title,
                      kind: place?.kind ?? 'activity',
                      ...(place && {
                        place: {
                          placeName: place.name,
                          address: place.address,
                          lat: place.lat,
                          lng: place.lng,
                          osmRef: place.osmRef,
                        },
                      }),
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
                      editor={editorOf(item.id)}
                      travel={arrivals[index]?.travel ?? null}
                      late={arrivals[index]?.late ?? null}
                      near={near}
                      tools={tools}
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
            {shorter && (
              <p className="px-4 pt-4">
                <button type="button" className="btn" onClick={shorten}>
                  {t('shorten', { distance: formatDistance(shorter.savedKm * 1000, locale) })}
                </button>
              </p>
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

      <Toast undo={undo} notice={notice} canEdit={canEdit} dispatch={dispatch} />
    </DndContext>
  )
}
