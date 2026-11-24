import { expect, test } from 'vitest'
import { applyLocally, type Trip } from './index'

const item = (id: string, over = {}) => ({
  id,
  dayId: 'd1',
  position: 'a0',
  kind: 'activity' as const,
  title: id,
  startTime: null,
  endTime: null,
  placeName: null,
  address: null,
  notes: null,
  version: 1,
  updatedBy: null,
  ...over,
})
const trip: Trip = {
  id: 't',
  title: 'BH',
  destination: 'BH',
  startDate: '2027-03-04',
  endDate: '2027-03-05',
  archivedAt: null,
  timezone: 'UTC',
  revision: 3,
  role: 'owner',
  members: [],
  days: [
    { id: 'd1', date: '2027-03-04', title: null, notes: null },
    { id: 'd2', date: '2027-03-05', title: null, notes: null },
  ],
  items: [item('a'), item('b', { position: 'a1' })],
}

test('creates an item in its place and leaves the original trip alone', () => {
  const next = applyLocally(trip, {
    type: 'item.create',
    itemId: 'c',
    dayId: 'd1',
    position: 'a0V',
    title: 'C',
    kind: 'food',
  })
  expect(next.items.map((i) => i.id)).toEqual(['a', 'c', 'b'])
  expect(trip.items).toHaveLength(2)
})
test('updates only the sent fields', () => {
  const next = applyLocally(trip, {
    type: 'item.update',
    itemId: 'a',
    baseVersion: 1,
    fields: { notes: 'x' },
  })
  expect(next.items[0]).toMatchObject({ title: 'a', notes: 'x' })
})
test('drops the end time with the start time, like the server', () => {
  const timed = { ...trip, items: [item('a', { startTime: '09:00', endTime: '10:00' })] }
  const next = applyLocally(timed, {
    type: 'item.update',
    itemId: 'a',
    baseVersion: 1,
    fields: { startTime: null },
  })
  expect(next.items[0]).toMatchObject({ startTime: null, endTime: null })
})
test('moves and sorts again', () => {
  const next = applyLocally(trip, { type: 'item.move', itemId: 'a', dayId: 'd1', position: 'a2' })
  expect(next.items.map((i) => i.id)).toEqual(['b', 'a'])
})
test('deletes', () => {
  expect(applyLocally(trip, { type: 'item.delete', itemId: 'a' }).items.map((i) => i.id)).toEqual([
    'b',
  ])
})
test('renames a day', () => {
  expect(
    applyLocally(trip, { type: 'day.update', dayId: 'd2', fields: { title: 'Volta' } }).days[1]
      ?.title,
  ).toBe('Volta')
})
