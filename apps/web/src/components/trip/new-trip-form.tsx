'use client'

import { useLocale, useTranslations } from 'next-intl'
import { startTransition, useActionState } from 'react'
import { createTripAction } from '@/lib/trips'
import { TripFields } from './trip-fields'

export function NewTripForm() {
  const t = useTranslations('TripForm')
  const [error, submit, pending] = useActionState(createTripAction.bind(null, useLocale()), null)
  return (
    <form
      action={submit}
      // Submitting by hand keeps what was typed when the server refuses the form.
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        startTransition(() => submit(form))
      }}
      className="flex max-w-lg flex-col gap-5"
    >
      <TripFields error={error} />
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {t('create')}
      </button>
    </form>
  )
}
