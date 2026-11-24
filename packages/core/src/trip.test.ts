import { describe, expect, test } from 'vitest'
import { datesBetween, newTripSchema, operationSchema, shiftDate } from './index'

const trip = {
  title: 'BH com os amigos',
  destination: 'Belo Horizonte',
  startDate: '2027-03-04',
  endDate: '2027-03-08',
  timezone: 'America/Sao_Paulo',
}
const id = '00000000-0000-4000-8000-000000000001'
const op = (o: object) => operationSchema.safeParse(o).success

describe('dates', () => {
  test('lists every day of the trip, both ends included', () => {
    expect(datesBetween('2027-03-04', '2027-03-06')).toEqual([
      '2027-03-04',
      '2027-03-05',
      '2027-03-06',
    ])
  })
  test('crosses months and leap days', () => {
    expect(datesBetween('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })
  test('is not bent by daylight saving', () => {
    expect(datesBetween('2027-03-13', '2027-03-15')).toHaveLength(3)
  })
  test('shifts a date', () => {
    expect(shiftDate('2027-12-31', 1)).toBe('2028-01-01')
  })
})

describe('a new trip', () => {
  test('is accepted, with its text trimmed', () => {
    expect(newTripSchema.parse({ ...trip, title: '  BH  ' }).title).toBe('BH')
  })
  test.each([
    ['a blank title', { title: '   ' }],
    ['an end before the start', { endDate: '2027-03-01' }],
    ['a date that does not exist', { startDate: '2027-02-30' }],
    ['an unknown timezone', { timezone: 'Mars/Olympus' }],
    ['more than 90 days', { endDate: '2027-06-30' }],
  ])('is refused with %s', (_, over) => {
    expect(newTripSchema.safeParse({ ...trip, ...over }).success).toBe(false)
  })
})

describe('operations', () => {
  test('a new item may come without a time', () => {
    expect(
      op({
        type: 'item.create',
        itemId: id,
        dayId: null,
        position: 'a0',
        title: 'Museu',
        kind: 'activity',
      }),
    ).toBe(true)
  })
  test('an update must change something', () => {
    expect(op({ type: 'item.update', itemId: id, baseVersion: 1, fields: {} })).toBe(false)
  })
  test('an update cannot touch fields it does not own', () => {
    expect(op({ type: 'item.update', itemId: id, baseVersion: 1, fields: { tripId: id } })).toBe(
      false,
    )
  })
  test('times are checked', () => {
    const at = (startTime: string) =>
      op({ type: 'item.update', itemId: id, baseVersion: 1, fields: { startTime } })
    expect([at('09:30'), at('24:00'), at('9:30')]).toEqual([true, false, false])
  })
  test('a malformed position is refused', () => {
    expect(op({ type: 'item.move', itemId: id, dayId: null, position: 'not a key!' })).toBe(false)
  })
})
