import type { LogEntry, Trip, TripItem } from '@tripforge/core'
import { expect, test } from 'vitest'
import { historyLines } from './history'

const trip = {
  members: [{ userId: 'bob', name: 'Bob', image: null, role: 'editor' }],
  days: [],
} as unknown as Trip
const item = (id: string, dayId: string | null = 'd1') => ({ id, title: id, dayId }) as TripItem
const at = (minute: number) => new Date(Date.UTC(2027, 0, 1, 10, minute)).toISOString()
const entry = (
  revision: number,
  minute: number,
  op: LogEntry['op'],
  over: Partial<LogEntry> = {},
): LogEntry => ({
  revision,
  opId: `${revision}`,
  userId: 'ana',
  userName: 'Ana',
  at: at(minute),
  op,
  ...over,
})
const edit = (revision: number, minute: number, id: string, over = {}) =>
  entry(
    revision,
    minute,
    { type: 'item.update', itemId: id, baseVersion: 1, fields: { notes: 'x' } },
    { item: item(id), ...over },
  )

test('many small edits of one item by one person are one line', () => {
  expect(
    historyLines([edit(4, 12, 'a'), edit(3, 11, 'a'), edit(2, 10, 'a')], trip).map(
      (l) => l.revision,
    ),
  ).toEqual([4])
})
test('but not across items, people or a long pause', () => {
  const lines = historyLines(
    [
      edit(5, 30, 'a'),
      edit(4, 12, 'a'),
      edit(3, 11, 'a', { userId: 'bob', userName: 'Bob' }),
      edit(2, 10, 'b'),
    ],
    trip,
  )
  expect(lines.map((l) => l.revision)).toEqual([5, 4, 3, 2])
})
test('people coming and going', () => {
  const change = (userId: string, role: 'editor' | null) => ({
    type: 'member.changed' as const,
    userId,
    role,
  })
  const keys = historyLines(
    [
      entry(4, 4, change('bob', null)),
      entry(3, 3, change('bob', 'editor')),
      entry(2, 2, change('ana', null)),
      entry(1, 1, change('ana', 'editor')),
    ],
    trip,
  )
  expect(keys.map((l) => [l.key, l.other])).toEqual([
    ['removed', 'Bob'],
    ['role', 'Bob'],
    ['left', ''],
    ['joined', ''],
  ])
})
test('one day only', () => {
  const lines = historyLines(
    [edit(2, 2, 'a', { item: item('a', 'd2') }), edit(1, 1, 'b')],
    trip,
    'd1',
  )
  expect(lines.map((l) => l.title)).toEqual(['b'])
})

test('tells what the group did, without votes, tasks or what is hidden', () => {
  const withItem = {
    ...trip,
    items: [item('Museu')],
    group: { expenses: [{ id: 'kept', title: 'Hotel' }] },
  } as unknown as Trip
  const fields = { title: 'Jantar' } as never
  const lines = historyLines(
    [
      entry(9, 9, { type: 'expense.delete', expenseId: 'e' }),
      entry(8, 8, { type: 'expense.update', expenseId: 'kept', fields: { amount: 1 } }),
      entry(7, 7, { type: 'expense.create', expenseId: 'e', fields }),
      entry(6, 6, { type: 'comment.create', commentId: 'c', itemId: 'Museu', body: 'x' }),
      entry(5, 5, { type: 'item.booking', itemId: 'gone', fields: { code: 'x' } }),
      entry(4, 4, { type: 'attachment.added', itemId: 'Museu', attachment: {} as never }),
      entry(3, 3, { type: 'item.vote', itemId: 'Museu', on: true }),
      entry(2, 2, { type: 'task.create', taskId: 't', list: 'todo', title: 'x' }),
      entry(1, 1, { type: 'group.hidden' }),
    ],
    withItem,
  )
  expect(lines.map((l) => [l.key, l.title])).toEqual([
    ['expense_delete', 'Jantar'],
    ['expense_update', 'Hotel'],
    ['expense_create', 'Jantar'],
    ['comment_create', 'Museu'],
    ['item_booking', '?'],
    ['attachment_added', 'Museu'],
  ])
  expect(lines[3]?.dayId).toBe('d1')
})
test('autosaving a booking or an expense makes one line', () => {
  const some = { ...trip, items: [item('a')], group: { expenses: [] } } as unknown as Trip
  const op = { type: 'item.booking' as const, itemId: 'a', fields: { code: 'x' } }
  expect(historyLines([entry(2, 2, op), entry(1, 1, op)], some)).toHaveLength(1)
})
