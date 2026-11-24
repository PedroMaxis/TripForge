import { applyLocally, withItem } from './apply-locally'
import type { Role } from './domain'
import type { Operation } from './operations'
import type { Trip, TripItem } from './trip'

export type MemberChange = { type: 'member.changed'; userId: string; role: Role | null }

/** One change of a trip, as everybody hears about it. */
export type LogEntry = {
  revision: number
  opId: string
  userId: string
  userName: string
  at: string
  op: Operation | MemberChange
  /** How the item ended up, for operations on items. */
  item?: TripItem
}

/** The fields of an offline edit that someone else had already changed. */
export type Conflict = {
  itemId: string
  userName: string
  mine: Partial<TripItem>
  theirs: Partial<TripItem>
}

export type Presence = {
  userId: string
  name: string
  image: string | null
  /** The item open on their screen, if any. */
  editing: string | null
}

export type OperationResult = { revision: number; item?: TripItem; conflict?: Conflict }

/** The trip after a change, or null when only loading it again can tell. */
export function applyEntry(trip: Trip, entry: LogEntry): Trip | null {
  const { op, item, revision } = entry
  if (op.type === 'member.changed') return null
  if (op.type === 'trip.update' && (op.fields.startDate || op.fields.endDate)) return null
  const next = applyLocally(trip, op)
  return {
    ...(item && op.type !== 'item.delete' ? withItem(next, item) : next),
    revision,
  }
}

const placeFields = ['placeName', 'address', 'lat', 'lng', 'osmRef'] as const
const isPlaceField = (field: string) => (placeFields as readonly string[]).includes(field)

/** Which of these fields clash with the others; a place is one thing, so all of it clashes. */
export function clashingFields(mine: string[], others: Set<string>) {
  const placeClash = mine.some(isPlaceField) && placeFields.some((f) => others.has(f))
  return mine.filter((field) => (isPlaceField(field) ? placeClash : others.has(field)))
}
