'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import type { TripFormError } from '@/lib/trips'

type Values = {
  title: string
  destination: string
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
  // The list of timezones is the browser's, so it is only known after mounting.
  const [zones, setZones] = useState<string[]>(values ? [values.timezone] : [])
  const [zone, setZone] = useState(values?.timezone ?? '')
  useEffect(() => {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone
    setZones([...new Set([own, ...Intl.supportedValuesOf('timeZone')])].sort())
    setZone((current) => current || own)
  }, [])

  function changeDates(next: Partial<typeof dates>) {
    const changed = { ...dates, ...next }
    setDates(changed)
    onDates?.(changed.startDate, changed.endDate)
  }

  const text = (name: 'title' | 'destination', max: number) => (
    <div>
      <label htmlFor={`${id}-${name}`} className="font-medium">
        {t(name)}
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        defaultValue={values?.[name]}
        maxLength={max}
        required
        aria-invalid={error === name}
        className="field mt-1"
      />
    </div>
  )

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
      {text('title', 120)}
      {text('destination', 200)}
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
