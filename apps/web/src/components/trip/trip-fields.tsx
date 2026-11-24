'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
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
  const id = useId()
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
  }, [])

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
      <div>
        <label htmlFor={`${id}-zone`} className="font-medium">
          {t('timezone')}
        </label>
        <select
          id={`${id}-zone`}
          name="timezone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          aria-describedby={`${id}-zone-hint`}
          className="field mt-1"
        >
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <p id={`${id}-zone-hint`} className="mt-1 text-sm text-muted">
          {t('timezoneHint')}
        </p>
      </div>
      <p role="alert" className="text-danger empty:hidden">
        {error && t(`errors.${error}`)}
      </p>
    </>
  )
}
