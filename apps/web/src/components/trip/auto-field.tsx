'use client'

import { useEffect, useRef, useState } from 'react'

const saveDelay = 800

type Shared = {
  value: string
  onSave: (value: string) => void
  required?: boolean
  multiline?: boolean
}
type Props = Shared &
  Omit<React.ComponentProps<'input'>, keyof Shared | 'onChange' | 'onBlur' | 'ref' | 'onKeyDown'>

/**
 * Saves on its own: a moment after typing stops, when it loses focus, or when it goes away.
 * While someone types, what they typed wins over changes coming from elsewhere.
 */
export function AutoField({ value, onSave, required, multiline, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const commit = useRef(() => {})

  useEffect(() => {
    commit.current = () => {
      clearTimeout(timer.current)
      const next = pending.current
      pending.current = null
      if (next === null || next.trim() === value || (required && !next.trim())) return
      onSave(next)
    }
  })
  useEffect(() => () => commit.current(), [])

  const shared = {
    ...props,
    value: draft ?? value,
    onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      setDraft(event.target.value)
      pending.current = event.target.value
      clearTimeout(timer.current)
      timer.current = setTimeout(() => commit.current(), saveDelay)
    },
    onBlur: () => {
      commit.current()
      setDraft(null)
    },
  }
  return multiline ? (
    <textarea {...(shared as React.ComponentProps<'textarea'>)} rows={3} />
  ) : (
    <input
      {...(shared as React.ComponentProps<'input'>)}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  )
}
