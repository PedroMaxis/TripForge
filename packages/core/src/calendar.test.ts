import { expect, test } from 'vitest'
import { type Trip, tripCalendar } from './index'

const item = (over: object) => ({
  id: 'i1',
  dayId: 'd1',
  position: 'a0',
  kind: 'activity',
  title: 'Mercado Central',
  startTime: null,
  endTime: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  notes: null,
  ...over,
})
const calendar = (...items: object[]) =>
  tripCalendar(
    {
      id: 't1',
      title: 'BH com os amigos',
      timezone: 'America/Sao_Paulo',
      days: [{ id: 'd1', date: '2027-03-04', title: null, notes: null }],
      items,
    } as unknown as Trip,
    new Date('2027-01-01T12:00:00Z'),
  )
const lines = (text: string) => text.split('\r\n')

test('a stop with times is an event on the world clock', () => {
  const got = lines(calendar(item({ startTime: '09:30', endTime: '10:15' })))
  expect(got).toContain('DTSTART:20270304T123000Z')
  expect(got).toContain('DTEND:20270304T131500Z')
  expect(got).toContain('UID:i1@tripforge')
  expect(got).toContain('DTSTAMP:20270101T120000Z')
  expect(got).toContain('X-WR-CALNAME:BH com os amigos')
})
test('without an end it lasts an hour, and past midnight it ends the next day', () => {
  expect(lines(calendar(item({ startTime: '09:30' })))).toContain('DTEND:20270304T133000Z')
  const night = lines(calendar(item({ startTime: '22:00', endTime: '01:00' })))
  expect(night).toContain('DTEND:20270305T040000Z')
})
test('without a time it takes the whole day', () => {
  const got = lines(calendar(item({})))
  expect(got).toContain('DTSTART;VALUE=DATE:20270304')
  expect(got).toContain('DTEND;VALUE=DATE:20270305')
})
test('follows daylight saving', () => {
  const trip = {
    id: 't',
    title: 'NY',
    timezone: 'America/New_York',
    days: [{ id: 'd1', date: '2027-03-14' }],
    items: [item({ startTime: '09:00' })],
  } as unknown as Trip
  expect(lines(tripCalendar(trip, new Date(0)))).toContain('DTSTART:20270314T130000Z')
})
test('text cannot break out of its line', () => {
  const got = calendar(
    item({
      title: 'Bar; café, e\nEND:VEVENT\r\nX:1',
      placeName: 'A\\B',
      address: 'Rua 1',
      notes: 'x',
    }),
  )
  expect(lines(got).filter((l) => l === 'END:VEVENT')).toHaveLength(1)
  expect(got).toContain('SUMMARY:Bar\\; café\\, e\\nEND:VEVENT\\nX:1')
  expect(got).toContain('LOCATION:A\\\\B\\, Rua 1')
})
test('long lines are folded without splitting a letter', () => {
  const got = calendar(item({ notes: 'ã'.repeat(200) }))
  for (const line of lines(got)) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
  expect(got.replaceAll('\r\n ', '')).toContain('ã'.repeat(200))
})
test('ideas have no date, so they are not in it', () => {
  expect(calendar(item({ dayId: null }))).not.toContain('BEGIN:VEVENT')
})
