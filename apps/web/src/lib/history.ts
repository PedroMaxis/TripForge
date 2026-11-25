import type { LogEntry, Trip } from '@tripforge/core'

const autosaved = ['item.update', 'day.update', 'item.booking', 'expense.update']
const groupMs = 5 * 60_000

type EntryKey =
  | 'item_create'
  | 'item_update'
  | 'item_move'
  | 'item_delete'
  | 'item_restore'
  | 'day_update'
  | 'day_order'
  | 'item_booking'
  | 'comment_create'
  | 'attachment_added'
  | 'expense_create'
  | 'expense_update'
  | 'expense_delete'
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

/** An expense that is gone left its name in the log. */
function expenseTitle(id: string, trip: Trip, entries: LogEntry[]) {
  const known = trip.group?.expenses.find((e) => e.id === id)?.title
  if (known) return known
  for (const { op } of entries) {
    if ((op.type === 'expense.create' || op.type === 'expense.update') && op.expenseId === id) {
      if (op.fields.title) return op.fields.title
    }
  }
  return '?'
}

/** Null for what is not worth telling. */
function lineOf(entry: LogEntry, trip: Trip, entries: LogEntry[]): HistoryLine | null {
  const { op, item, revision, at, userName: name, userId } = entry
  const line = { revision, at, name, title: item?.title ?? '', other: '', dayId: item?.dayId }
  switch (op.type) {
    case 'item.booking':
    case 'comment.create':
    case 'attachment.added': {
      const about = trip.items.find((i) => i.id === op.itemId)
      const keys = {
        'item.booking': 'item_booking',
        'comment.create': 'comment_create',
        'attachment.added': 'attachment_added',
      } as const
      return { ...line, key: keys[op.type], title: about?.title ?? '?', dayId: about?.dayId }
    }
    case 'expense.create':
    case 'expense.update':
    case 'expense.delete': {
      const keys = {
        'expense.create': 'expense_create',
        'expense.update': 'expense_update',
        'expense.delete': 'expense_delete',
      } as const
      return { ...line, key: keys[op.type], title: expenseTitle(op.expenseId, trip, entries) }
    }
    case 'group.hidden':
    case 'item.vote':
    case 'comment.delete':
    case 'attachment.delete':
    case 'task.create':
    case 'task.update':
    case 'task.delete':
      return null
    case 'day.update':
      return { ...line, key: 'day_update', dayId: op.dayId }
    case 'day.order':
      return { ...line, key: 'day_order', dayId: op.dayId }
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

const subject = (op: LogEntry['op']) =>
  'itemId' in op ? op.itemId : 'expenseId' in op ? op.expenseId : null

/** The log in words, newest first. Autosave makes many small edits, which become one line. */
export function historyLines(entries: LogEntry[], trip: Trip, dayId?: string | null) {
  const lines: HistoryLine[] = []
  let last: LogEntry | undefined
  for (const entry of entries) {
    const line = lineOf(entry, trip, entries)
    if (!line) continue
    if (dayId !== undefined && line.dayId !== dayId) continue
    const sameEdit =
      last &&
      last.userId === entry.userId &&
      last.op.type === entry.op.type &&
      autosaved.includes(entry.op.type) &&
      line.dayId === lines.at(-1)?.dayId &&
      subject(last.op) === subject(entry.op) &&
      last.item?.id === entry.item?.id &&
      Date.parse(last.at) - Date.parse(entry.at) < groupMs
    last = entry
    if (!sameEdit) lines.push(line)
  }
  return lines
}
