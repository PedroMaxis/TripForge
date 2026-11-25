import { applyLocally, withItem } from './apply-locally'
import { operationTypes, type Role } from './domain'
import { type Attachment, isGroupOperation } from './group'
import type { Operation } from './operations'
import type { Trip, TripItem } from './trip'

export type MemberChange = { type: 'member.changed'; userId: string; role: Role | null }

/** A file that was uploaded. */
export type AttachmentAdded = { type: 'attachment.added'; itemId: string; attachment: Attachment }
/** Something among the group, to someone who only looks. */
export type GroupHidden = { type: 'group.hidden' }

/** One change of a trip, as everybody hears about it. */
export type LogEntry = {
  revision: number
  opId: string
  userId: string
  userName: string
  at: string
  op: Operation | MemberChange | AttachmentAdded | GroupHidden
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

/** The same change, with nothing in it that is only for the group. */
export function forViewer(entry: LogEntry): LogEntry {
  if (!isGroupOperation(entry.op) && entry.op.type !== 'attachment.added') return entry
  const { revision, opId, at } = entry
  return { revision, opId, userId: '', userName: '', at, op: { type: 'group.hidden' } }
}

/** The trip after a change, or null when only loading it again can tell. */
export function applyEntry(trip: Trip, entry: LogEntry): Trip | null {
  const { op, item, revision } = entry
  if (op.type === 'group.hidden') return trip.group ? null : { ...trip, revision }
  // Also what a newer version of the app did, which this one knows nothing about.
  if (op.type === 'member.changed' || !operationTypes.includes(op.type)) return null
  if (op.type === 'trip.update' && (op.fields.startDate || op.fields.endDate)) return null
  if (op.type === 'attachment.added' || isGroupOperation(op)) {
    if (!trip.group) return { ...trip, revision }
    const { userId, userName, at } = entry
    const group = { ...trip.group, people: { ...trip.group.people, [userId]: userName } }
    if (op.type === 'attachment.added') {
      return {
        ...trip,
        revision,
        group: { ...group, attachments: [...group.attachments, op.attachment] },
      }
    }
    return { ...applyLocally({ ...trip, group }, op, { userId, at }), revision }
  }
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
