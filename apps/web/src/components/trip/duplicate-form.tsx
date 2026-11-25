'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { duplicateTripAction } from '@/lib/trips'

export function DuplicateForm({
  tripId,
  title,
  startDate,
}: {
  tripId: string
  title: string
  startDate: string
}) {
  const t = useTranslations('Duplicate')
  const tForm = useTranslations('TripForm')
  const action = duplicateTripAction.bind(null, useLocale(), tripId)
  const [state, submit, pending] = useActionState(action, { title, startDate, failed: false })
  return (
    <form action={submit} className="flex max-w-lg flex-col gap-5">
      <div>
        <label htmlFor="copy-title" className="font-medium">
          {tForm('title')}
        </label>
        <input
          id="copy-title"
          name="title"
          defaultValue={state.title}
          maxLength={120}
          required
          className="field mt-1"
        />
      </div>
      <div>
        <label htmlFor="copy-start" className="font-medium">
          {tForm('startDate')}
        </label>
        <input
          id="copy-start"
          name="startDate"
          type="date"
          defaultValue={state.startDate}
          required
          className="field mt-1"
        />
      </div>
      <p role="alert" className="text-danger empty:hidden">
        {state.failed && t('failed')}
      </p>
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {t('create')}
      </button>
    </form>
  )
}
