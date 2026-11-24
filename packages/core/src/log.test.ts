import { expect, test } from 'vitest'
import { applyEntry, type LogEntry, type Trip } from './index'

const item = {
  id: 'a',
  dayId: 'd1',
  position: 'a0',
  kind: 'activity' as const,
  title: 'Museu',
  startTime: null,
  endTime: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  osmRef: null,
  notes: null,
  version: 1,
  updatedBy: null,
}
const trip: Trip = {
  id: 't',
  title: 'BH',
  destination: 'BH',
  destinationLat: null,
  destinationLng: null,
  startDate: '2027-03-04',
  endDate: '2027-03-05',
  archivedAt: null,
  timezone: 'UTC',
  revision: 3,
  role: 'owner',
  members: [],
  days: [{ id: 'd1', date: '2027-03-04', title: null, notes: null }],
  items: [item],
}
const entry = (over: Partial<LogEntry>): LogEntry => ({
  revision: 4,
  opId: 'o',
  userId: 'u',
  userName: 'Ana',
  at: '',
  op: { type: 'item.delete', itemId: 'a' },
  ...over,
})

test('an updated item arrives as the server has it', () => {
  const next = applyEntry(
    trip,
    entry({
      op: { type: 'item.update', itemId: 'a', baseVersion: 1, fields: { title: 'X' } },
      item: { ...item, title: 'Parque', version: 5 },
    }),
  )
  expect(next).toMatchObject({ revision: 4, items: [{ title: 'Parque', version: 5 }] })
})
test('a deleted item goes away even though it comes along', () => {
  expect(applyEntry(trip, entry({ item }))).toMatchObject({ revision: 4, items: [] })
})
test('a restored item comes back', () => {
  expect(
    applyEntry({ ...trip, items: [] }, entry({ op: { type: 'item.restore', itemId: 'a' }, item }))
      ?.items,
  ).toEqual([item])
})
test('a day is renamed', () => {
  expect(
    applyEntry(
      trip,
      entry({ op: { type: 'day.update', dayId: 'd1', fields: { title: 'Chegada' } } }),
    )?.days[0]?.title,
  ).toBe('Chegada')
})
test('a new name for the trip applies; new dates need the whole trip again', () => {
  expect(
    applyEntry(trip, entry({ op: { type: 'trip.update', fields: { title: 'Minas' } } }))?.title,
  ).toBe('Minas')
  expect(
    applyEntry(trip, entry({ op: { type: 'trip.update', fields: { endDate: '2027-03-09' } } })),
  ).toBeNull()
})
test('people changing needs the whole trip again', () => {
  expect(
    applyEntry(trip, entry({ op: { type: 'member.changed', userId: 'x', role: 'viewer' } })),
  ).toBeNull()
})
