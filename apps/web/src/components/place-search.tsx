'use client'

import type { Place } from '@tripforge/core'
import { useLocale } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

export type FoundPlace = Place & { timezone: string }
export type Near = { lat: number; lng: number } | null

const searchDelay = 300
const minLength = 2

type Own = {
  value: string
  near: Near
  onText: (text: string) => void
  onPick: (place: FoundPlace) => void
}
type Props = Own & Omit<React.ComponentProps<'input'>, keyof Own | 'onChange' | 'list' | 'role'>

/** A text field that suggests places. Whatever is typed counts, with or without a suggestion. */
export function PlaceSearch({ value, near, onText, onPick, onKeyDown, onBlur, ...props }: Props) {
  const locale = useLocale()
  const listId = useId()
  const [places, setPlaces] = useState<FoundPlace[]>([])
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  // Only typing searches; a value that was already there does not.
  const [query, setQuery] = useState('')
  const picked = useRef(false)

  useEffect(() => {
    const text = query.trim()
    if (text.length < minLength) {
      setPlaces([])
      return
    }
    const abort = new AbortController()
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: text, locale })
      if (near) {
        params.set('lat', String(near.lat))
        params.set('lng', String(near.lng))
      }
      try {
        const res = await fetch(`/api/places?${params}`, { signal: abort.signal })
        const found = res.ok ? ((await res.json()) as { places: FoundPlace[] }).places : []
        setPlaces(found)
        setActive(-1)
      } catch {
        // Aborted, or no connection: typing still works.
      }
    }, searchDelay)
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [query, near, locale])

  const shown = open && places.length > 0

  function choose(place: FoundPlace) {
    picked.current = true
    setOpen(false)
    setPlaces([])
    setQuery('')
    onPick(place)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        {...props}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          picked.current = false
          onText(event.target.value)
          setQuery(event.target.value)
          setOpen(true)
        }}
        onBlur={(event) => {
          setOpen(false)
          if (!picked.current) onBlur?.(event)
          picked.current = false
        }}
        onKeyDown={(event) => {
          if (shown && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((active + step + places.length) % places.length)
          } else if (shown && event.key === 'Enter' && places[active]) {
            event.preventDefault()
            choose(places[active])
          } else if (shown && event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          } else {
            onKeyDown?.(event)
          }
        }}
      />
      <div
        id={listId}
        role="listbox"
        hidden={!shown}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-paper p-1 shadow-[0_6px_20px_oklch(29%_0.045_158/.16)]"
      >
        {places.map((place, index) => (
          <div
            key={place.osmRef}
            id={`${listId}-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            // Before the field loses focus, so nothing is saved in between.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(place)}
            onKeyDown={() => {}}
            className={`cursor-pointer rounded-xl px-3 py-2 ${index === active ? 'bg-soft' : 'hover:bg-mist'}`}
          >
            <span className="block font-medium">{place.name}</span>
            <span className="block text-sm text-ink-2">{place.address}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
