'use client'

import { nextStop, type Trip } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { formatDate, formatRange } from '@/lib/dates'
import { itemsOf } from '@/lib/trip-store'
import { Logo } from '../logo'
import { Cover } from './cover'
import { DayStrip } from './day-strip'
import { NextStop } from './next-stop'
import { Stop } from './stop'
import { TripLinks } from './trip-links'
import { type MapSources, TripMap } from './trip-map'
import { useArrivals } from './use-arrivals'
import { useLegs } from './use-legs'
import { useNow } from './use-now'
import { useWeather } from './use-weather'
import { Weather } from './weather'

const refreshMs = 10_000

type Gone = 'revoked' | 'expired' | 'unknown'

/** Keeps the trip up to date while it is being looked at. */
function useSharedTrip(initial: Trip, source: string) {
  const [trip, setTrip] = useState(initial)
  const [gone, setGone] = useState<Gone | null>(null)
  const { revision } = trip
  useEffect(() => {
    if (gone) return
    async function refresh() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`${source}?since=${revision}`)
        if (res.status === 200) setTrip((await res.json()) as Trip)
        if (res.status === 404 || res.status === 410) {
          setGone(((await res.json()) as { error: Gone }).error)
        }
      } catch {
        // No connection: what is on screen stays, and it is tried again.
      }
    }
    const timer = setInterval(refresh, refreshMs)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [source, revision, gone])
  return { trip, gone }
}

const nothing = () => {}

/** An itinerary to look at, for people without an account. Nothing here asks for anything. */
export function SharedTrip({
  initial,
  initialDayId,
  token,
  sources,
  action,
}: {
  initial: Trip
  initialDayId: string | null
  token: string
  sources: MapSources
  /** Only for someone who does have an account. */
  action?: React.ReactNode
}) {
  const t = useTranslations('Trip')
  const tInvite = useTranslations('Invite')
  const locale = useLocale()
  const source = `/api/see/${token}`
  const { trip, gone } = useSharedTrip(initial, source)
  const [chosenId, setDayId] = useState(initialDayId)
  const [openId, setOpenId] = useState<string | null>(null)
  const legs = useLegs(trip, true, source)
  const weather = useWeather(source)
  const now = useNow(trip.timezone)
  const today = now && trip.days.find((d) => d.date === now.date)
  const next = now && today ? nextStop(itemsOf(trip, today.id), now.time) : null

  // The chosen day may have been taken away meanwhile.
  const day = trip.days.find((d) => d.id === chosenId) ?? trip.days[0]
  const dayId = day?.id ?? null
  const list = itemsOf(trip, dayId)
  const { arrivals, total } = useArrivals(list, true, legs)
  const hasMap = trip.destinationLat !== null || trip.items.some((i) => i.lat !== null)
  const dayName = (index: number) =>
    trip.days[index]?.title ?? t('dayNumber', { number: index + 1 })

  if (gone) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl">
          {tInvite(`gone.${gone === 'expired' ? 'expired' : 'revoked'}`)}
        </h1>
        <p className="mt-4 text-lg text-ink-2">{tInvite('gone.ask')}</p>
      </main>
    )
  }

  function choose(next: string | null) {
    setDayId(next)
    setOpenId(null)
  }

  return (
    <div
      className={`grid h-dvh grid-cols-[minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)_auto] ${
        hasMap
          ? 'grid-rows-[auto_34dvh_auto_minmax(0,1fr)] md:grid-cols-[minmax(380px,464px)_minmax(0,1fr)]'
          : 'grid-rows-[auto_auto_minmax(0,1fr)]'
      }`}
    >
      <header className="col-span-full flex items-center justify-between gap-3 px-4 py-2 md:px-6">
        <Logo href="/" />
        {action}
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
        ideas={false}
        className="col-span-full md:row-start-3"
      />

      <main
        className={`min-h-0 overflow-y-auto px-2 pb-24 md:col-start-1 md:row-start-2 ${hasMap ? '' : 'md:px-6'}`}
      >
        <div className="mx-auto max-w-3xl">
          <Cover
            trip={trip}
            source={source}
            className="mx-2 rounded-2xl px-5 py-5 md:px-6 md:pt-12 md:pb-6"
          >
            <h1 className="text-3xl md:text-4xl">{trip.title}</h1>
            <p className="mt-2 text-ink-2">
              {trip.destination}, {formatRange(trip.startDate, trip.endDate, locale)}
            </p>
          </Cover>
          {now && next && (
            <NextStop
              item={next}
              time={now.time}
              onOpen={() => {
                choose(next.dayId)
                setOpenId(next.id)
              }}
            />
          )}
          {day && (
            <div className="px-4 pt-6 pb-3">
              <h2 className="text-2xl">{dayName(trip.days.indexOf(day))}</h2>
              <p className="text-muted">
                {formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                {total && `, ${total}`}
              </p>
              <Weather weather={weather[day.date]} />
            </div>
          )}
          {list.length === 0 ? (
            <div className="mx-2 rounded-2xl bg-mist px-6 py-10">
              <h3 className="text-xl">{t('emptyDay')}</h3>
              <p className="mt-2 text-ink-2">{t('emptyDayViewer')}</p>
            </div>
          ) : (
            <ol className="grid gap-0.5">
              {list.map((item, index) => (
                <Stop
                  key={item.id}
                  item={item}
                  number={index + 1}
                  travel={arrivals[index]?.travel ?? null}
                  late={null}
                  editor={null}
                  near={null}
                  tools={null}
                  days={trip.days}
                  dayName={dayName}
                  open={openId === item.id}
                  canEdit={false}
                  onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  onSave={nothing}
                  onMove={nothing}
                  onDelete={nothing}
                />
              ))}
            </ol>
          )}
          <TripLinks page={`/see/${token}`} source={source} member={false} />
        </div>
      </main>
    </div>
  )
}
