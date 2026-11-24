'use client'

import type { TripItem } from '@tripforge/core'
import { useState } from 'react'
import { type Near, PlaceSearch } from '../place-search'

type PlaceFields = Pick<TripItem, 'placeName' | 'address' | 'lat' | 'lng' | 'osmRef'>

/** The place of a stop. Picking a suggestion puts it on the map; writing over it takes it off. */
export function PlaceField({
  id,
  item,
  near,
  onSave,
}: {
  id: string
  item: TripItem
  near: Near
  onSave: (fields: Partial<PlaceFields>) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const saved = item.placeName ?? ''
  return (
    <PlaceSearch
      id={id}
      value={draft ?? saved}
      near={near}
      maxLength={200}
      onText={setDraft}
      onPick={({ name, address, lat, lng, osmRef }) => {
        setDraft(null)
        onSave({ placeName: name, address, lat, lng, osmRef })
      }}
      onBlur={() => {
        if (draft !== null && draft.trim() !== saved) {
          onSave({ placeName: draft, lat: null, lng: null, osmRef: null })
        }
        setDraft(null)
      }}
      className="field mt-1"
    />
  )
}
