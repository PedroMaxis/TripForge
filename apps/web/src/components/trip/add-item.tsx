'use client'

import type { Place } from '@tripforge/core'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { type Near, PlaceSearch } from '../place-search'

export function AddItem({
  button,
  label,
  near,
  onAdd,
}: {
  button: string
  label: string
  near: Near
  onAdd: (title: string, place?: Place) => void
}) {
  const t = useTranslations('Trip')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {button}
      </button>
    )
  }
  return (
    <form
      className="flex min-w-0 flex-1 basis-72 gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!title.trim()) return
        onAdd(title.trim())
        setTitle('')
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        setOpen(false)
        setTitle('')
      }}
    >
      <PlaceSearch
        autoFocus
        aria-label={label}
        placeholder={label}
        value={title}
        near={near}
        maxLength={200}
        onText={setTitle}
        onPick={(place) => {
          onAdd(place.name, place)
          setTitle('')
        }}
        className="field min-w-0"
      />
      <button type="submit" className="btn btn-primary">
        {t('add')}
      </button>
    </form>
  )
}
