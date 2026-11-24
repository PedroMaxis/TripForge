'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function AddItem({
  button,
  label,
  onAdd,
}: {
  button: string
  label: string
  onAdd: (title: string) => void
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
      <input
        ref={(node) => node?.focus()}
        aria-label={label}
        placeholder={label}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        className="field min-w-0"
      />
      <button type="submit" className="btn btn-primary">
        {t('add')}
      </button>
    </form>
  )
}
