'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import type { TripFormError } from '@/lib/trips'
import { PlaceSearch } from '../place-search'

type Values = {
  title: string
  destination: string
  destinationLat: number | null
  destinationLng: number | null
  startDate: string
  endDate: string
  timezone: string
}

export function TripFields({
  values,
  error,
  onDates,
}: {
  values?: Values
  error: TripFormError | null
  onDates?: (startDate: string, endDate: string) => void
}) {
  const t = useTranslations('TripForm')
  const locale = useLocale()
  const id = useId()
  const zoneList = useRef<HTMLSelectElement>(null)
  // Most people never need to see the list: the destination sets the clock.
  const [choosing, setChoosing] = useState(error === 'timezone')
  const [ready, setReady] = useState(false)
  const [dates, setDates] = useState({
    startDate: values?.startDate ?? '',
    endDate: values?.endDate ?? '',
  })
  const [destination, setDestination] = useState(values?.destination ?? '')
  const [point, setPoint] = useState(
    values && values.destinationLat !== null && values.destinationLng !== null
      ? { lat: values.destinationLat, lng: values.destinationLng }
      : null,
  )
  // The list of timezones is the browser's, so it is only known after mounting.
  const [zones, setZones] = useState<string[]>(values ? [values.timezone] : [])
  const [zone, setZone] = useState(values?.timezone ?? '')
  useEffect(() => {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone
    setZones((current) =>
      [...new Set([own, ...current, ...Intl.supportedValuesOf('timeZone')])].sort(),
    )
    setZone((current) => current || own)
    setReady(true)
  }, [])
  useEffect(() => {
    if (choosing) zoneList.current?.focus()
  }, [choosing])

  function changeDates(next: Partial<typeof dates>) {
    const changed = { ...dates, ...next }
    setDates(changed)
    onDates?.(changed.startDate, changed.endDate)
  }

  const date = (name: 'startDate' | 'endDate') => (
    <div>
      <label htmlFor={`${id}-${name}`} className="font-medium">
        {t(name)}
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        type="date"
        value={dates[name]}
        onChange={(e) => changeDates({ [name]: e.target.value })}
        required
        aria-invalid={error === 'dates'}
        className="field mt-1"
      />
    </div>
  )

  return (
    <>
      <div>
        <label htmlFor={`${id}-title`} className="font-medium">
          {t('title')}
        </label>
        <input
          id={`${id}-title`}
          name="title"
          defaultValue={values?.title}
          maxLength={120}
          required
          aria-invalid={error === 'title'}
          className="field mt-1"
        />
      </div>
      <div>
        <label htmlFor={`${id}-destination`} className="font-medium">
          {t('destination')}
        </label>
        <PlaceSearch
          id={`${id}-destination`}
          name="destination"
          value={destination}
          near={null}
          maxLength={200}
          required
          aria-invalid={error === 'destination'}
          onText={(text) => {
            setDestination(text)
            setPoint(null)
          }}
          onPick={(place) => {
            setDestination(place.name)
            setPoint({ lat: place.lat, lng: place.lng })
            setZones((current) => [...new Set([...current, place.timezone])].sort())
            setZone(place.timezone)
          }}
          className="field mt-1"
        />
        <input type="hidden" name="destinationLat" value={point?.lat ?? ''} />
        <input type="hidden" name="destinationLng" value={point?.lng ?? ''} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {date('startDate')}
        {date('endDate')}
      </div>
      {choosing ? (
        <div>
          <label htmlFor={`${id}-zone`} className="font-medium">
            {t('timezone')}
          </label>
          <select
            ref={zoneList}
            id={`${id}-zone`}
            name="timezone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            aria-describedby={`${id}-zone-hint`}
            className="field mt-1"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {zoneLabel(z, locale)}
              </option>
            ))}
          </select>
          <p id={`${id}-zone-hint`} className="mt-1 text-sm text-muted">
            {t('timezoneHint')}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          <input type="hidden" name="timezone" value={zone} />
          {ready && zone && (
            <>
              {t('clock', { zone: zoneName(zone, locale) })}{' '}
              <button
                type="button"
                onClick={() => setChoosing(true)}
                className="font-medium text-ink underline underline-offset-4"
              >
                {t('changeClock')}
              </button>
            </>
          )}
        </p>
      )}
      <p role="alert" className="text-danger empty:hidden">
        {error && t(`errors.${error}`)}
      </p>
    </>
  )
}

/** "Horário Padrão de Brasília" rather than "America/Sao_Paulo". */
export function zoneName(zone: string, locale: string) {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: 'longGeneric',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}

function zoneLabel(zone: string, locale: string) {
  const city = zone.split('/').at(-1)?.replaceAll('_', ' ') ?? zone
  const name = zoneName(zone, locale)
  return name === city ? city : `${city} · ${name}`
}
