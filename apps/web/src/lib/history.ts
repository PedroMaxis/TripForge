import type { LogEntry, Trip } from '@tripforge/core'

const groupMs = 5 * 60_000

type EntryKey =
  | 'item_create'
  | 'item_update'
  | 'item_move'
  | 'item_delete'
  | 'item_restore'
  | 'day_update'
  | 'trip_update'
  | 'archived'
  | 'unarchived'
  | 'joined'
  | 'left'
  | 'removed'
  | 'role'

export type HistoryLine = {
  revision: number
  at: string
  key: EntryKey
  name: string
  title: string
  other: string
  /** The day it is about; null for Ideas, undefined when it is about no day. */
  dayId: string | null | undefined
}

function lineOf(entry: LogEntry, trip: Trip): HistoryLine {
  const { op, item, revision, at, userName: name, userId } = entry
  const line = { revision, at, name, title: item?.title ?? '', other: '', dayId: item?.dayId }
  switch (op.type) {
    case 'day.update':
      return { ...line, key: 'day_update', dayId: op.dayId }
    case 'trip.update': {
      const { archived } = op.fields
      const key = archived === undefined ? 'trip_update' : archived ? 'archived' : 'unarchived'
      return { ...line, key }
    }
    case 'member.changed': {
      const other = trip.members.find((m) => m.userId === op.userId)?.name ?? '?'
      if (op.userId === userId) return { ...line, key: op.role ? 'joined' : 'left' }
      return { ...line, key: op.role ? 'role' : 'removed', other }
    }
    case 'item.create':
      return { ...line, key: 'item_create' }
    case 'item.update':
      return { ...line, key: 'item_update' }
    case 'item.move':
      return { ...line, key: 'item_move' }
    case 'item.delete':
      return { ...line, key: 'item_delete' }
    case 'item.restore':
      return { ...line, key: 'item_restore' }
  }
}

/** The log in words, newest first. Autosave makes many small edits, which become one line. */
export function historyLines(entries: LogEntry[], trip: Trip, dayId?: string | null) {
  const lines: HistoryLine[] = []
  let last: LogEntry | undefined
  for (const entry of entries) {
    const line = lineOf(entry, trip)
    if (dayId !== undefined && line.dayId !== dayId) continue
    const sameEdit =
      last &&
      last.userId === entry.userId &&
      last.op.type === entry.op.type &&
      (entry.op.type === 'item.update' || entry.op.type === 'day.update') &&
      line.dayId === lines.at(-1)?.dayId &&
      last.item?.id === entry.item?.id &&
      Date.parse(last.at) - Date.parse(entry.at) < groupMs
    last = entry
    if (!sameEdit) lines.push(line)
  }
  return lines
}
