import { describe, expect, test } from 'vitest'
import type { LogEntry, Trip, TripItem } from './index'
import { applyEntry, applyLocally, clockIn, nextStop, operationSchema, shorterOrder } from './index'

const item = (id: string, over: Partial<TripItem> = {}): TripItem => ({
  id,
  dayId: 'd1',
  position: id,
  kind: 'activity',
  title: id,
  startTime: null,
  endTime: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  osmRef: null,
  notes: null,
  done: false,
  version: 1,
  updatedBy: null,
  ...over,
})
const at = (id: string, lng: number, over: Partial<TripItem> = {}) =>
  item(id, { lat: 0, lng, ...over })
const ids = (items: TripItem[]) => shorterOrder(items)?.ids.join('') ?? null

describe('what time it is there', () => {
  test('is read on the clock of the trip', () => {
    const now = new Date('2027-03-05T02:30:00Z')
    expect(clockIn('America/Sao_Paulo', now)).toEqual({ date: '2027-03-04', time: '23:30' })
    expect(clockIn('Asia/Tokyo', now)).toEqual({ date: '2027-03-05', time: '11:30' })
  })
  test('midnight is 00, not 24', () => {
    expect(clockIn('UTC', new Date('2027-03-05T00:05:00Z')).time).toBe('00:05')
  })
})

describe('the next stop', () => {
  const day = [
    item('a', { startTime: '09:00', endTime: '10:00' }),
    item('b'),
    item('c', { startTime: '14:00' }),
  ]
  test('is the first one that has not ended', () => {
    expect(nextStop(day, '08:00')?.id).toBe('a')
    expect(nextStop(day, '09:30')?.id).toBe('a')
    expect(nextStop(day, '10:30')?.id).toBe('b')
  })
  test('without an end, a stop lasts an hour', () => {
    expect(nextStop([item('c', { startTime: '14:00' })], '14:59')?.id).toBe('c')
    expect(nextStop([item('c', { startTime: '14:00' })], '15:01')).toBeNull()
  })
  test('a stop before one that already started is over too', () => {
    expect(nextStop(day, '14:10')?.id).toBe('c')
  })
  test('comes after the last one marked as done', () => {
    expect(nextStop([day[0]!, { ...day[1]!, done: true }, day[2]!], '08:00')?.id).toBe('c')
    expect(nextStop([{ ...day[2]!, done: true }], '08:00')).toBeNull()
  })
  test('a stop past midnight is still on', () => {
    expect(nextStop([item('a', { startTime: '22:00', endTime: '01:00' })], '23:30')?.id).toBe('a')
  })
})

describe('a shorter order', () => {
  test('keeps the first stop and walks the rest along the way', () => {
    expect(ids([at('a', 0), at('b', 0.3), at('c', 0.1), at('d', 0.2)])).toBe('acdb')
  })
  test('says how much it saves', () => {
    const better = shorterOrder([at('a', 0), at('b', 0.2), at('c', 0.1)])
    expect(better?.savedKm).toBeGreaterThan(10)
    expect(better?.savedKm).toBeLessThan(12)
  })
  test('is not offered when there is nothing worth saving', () => {
    expect(ids([at('a', 0), at('b', 0.1), at('c', 0.2)])).toBeNull()
    expect(ids([at('a', 0), at('b', 0.0002), at('c', 0.0001)])).toBeNull()
    expect(ids([at('a', 0), at('b', 0.2)])).toBeNull()
  })
  test('stops with a time keep their order', () => {
    const day = [
      at('a', 0),
      at('b', 0.3, { startTime: '10:00' }),
      at('c', 0.1, { startTime: '12:00' }),
    ]
    expect(ids(day)).toBeNull()
    expect(ids([...day, at('d', 0.29)])).toBe('adbc')
  })
  test('a place to sleep at the end stays there', () => {
    expect(ids([at('a', 0), at('b', 0.3), at('c', 0.1, { kind: 'lodging' })])).toBeNull()
  })
  test('a stop without a place follows the one before it', () => {
    expect(ids([item('x'), at('a', 0), at('b', 0.2), item('y'), at('c', 0.1)])).toBe('xacby')
  })
  test('is found for a full day, and not tried past that', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => at(`${i}`.padStart(2, '0'), i % 2 ? i : n - i))
    expect(shorterOrder(many(12))).not.toBeNull()
    expect(shorterOrder(many(13))).toBeNull()
  })
})

describe('reordering a day', () => {
  const trip = {
    revision: 1,
    role: 'owner',
    days: [],
    members: [],
    items: [item('a'), item('b'), item('c'), item('z', { dayId: 'd2' })],
  } as unknown as Trip
  const op = {
    type: 'day.order' as const,
    dayId: 'd1',
    items: [
      { itemId: 'c', position: 'a0' },
      { itemId: 'a', position: 'a1' },
      { itemId: 'b', position: 'a2' },
      { itemId: 'z', position: 'a3' },
    ],
  }
  test('moves the stops of that day and no other', () => {
    const next = applyLocally(trip, op)
    expect(next.items.filter((i) => i.dayId === 'd1').map((i) => i.id)).toEqual(['c', 'a', 'b'])
    expect(next.items.find((i) => i.id === 'z')?.position).toBe('z')
  })
  test('is heard like any other change', () => {
    const entry = { revision: 2, op } as unknown as LogEntry
    expect(applyEntry(trip, entry)?.revision).toBe(2)
  })
  test('a change this version does not know means loading again', () => {
    const entry = { revision: 2, op: { type: 'from.the.future' } } as unknown as LogEntry
    expect(applyEntry(trip, entry)).toBeNull()
  })
  test('refuses a stop twice, and an empty list', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const ok = (items: object[]) =>
      operationSchema.safeParse({ type: 'day.order', dayId: id, items }).success
    expect(ok([{ itemId: id, position: 'a0' }])).toBe(true)
    expect(
      ok([
        { itemId: id, position: 'a0' },
        { itemId: id, position: 'a1' },
      ]),
    ).toBe(false)
    expect(ok([])).toBe(false)
  })
})
