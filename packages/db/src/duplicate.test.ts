import { randomUUID } from 'node:crypto'
import type { Operation } from '@tripforge/core'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { tripMembers, users } from './index'
import { applyOperation } from './operations'
import { createTestDb, type TestDb } from './testing'
import { createTrip, duplicateTrip, getTrip } from './trips'

let t: TestDb
let tripId: string
beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())
beforeEach(async () => {
  await t.reset()
  await t.db
    .insert(users)
    .values(
      ['owner', 'ana', 'stranger'].map((id) => ({ id, name: id, email: `${id}@example.com` })),
    )
  tripId = await createTrip(t.db, 'owner', {
    title: 'BH',
    destination: 'Belo Horizonte',
    destinationLat: -19.9,
    destinationLng: -43.9,
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'America/Sao_Paulo',
  })
  await t.db.insert(tripMembers).values({ tripId, userId: 'ana', role: 'viewer' })
})
const apply = (op: Operation) =>
  applyOperation(t.db, { userId: 'owner', tripId, opId: randomUUID(), op })
const wanted = { title: 'BH de novo', startDate: '2028-01-10' }

test('copies the days and the stops to the new dates', async () => {
  const [, second] = (await getTrip(t.db, 'owner', tripId))!.days
  const [kept, idea, gone] = [randomUUID(), randomUUID(), randomUUID()]
  const create = { type: 'item.create' as const, position: 'a0', kind: 'food' as const }
  await apply({
    ...create,
    itemId: kept,
    dayId: second!.id,
    title: 'Mercado',
    place: { placeName: 'Mercado', address: 'Rua 1', lat: -19.9, lng: -43.9, osmRef: 'W1' },
  })
  await apply({ ...create, itemId: idea, dayId: null, title: 'Ideia' })
  await apply({ ...create, itemId: gone, dayId: second!.id, title: 'Apagada' })
  await apply({ type: 'item.delete', itemId: gone })
  await apply({ type: 'day.update', dayId: second!.id, fields: { title: 'Centro' } })
  await apply({
    type: 'item.update',
    itemId: kept,
    baseVersion: 1,
    fields: { startTime: '10:00', notes: 'Queijo', done: true },
  })

  const copyId = await duplicateTrip(t.db, 'ana', tripId, wanted)
  const copy = (await getTrip(t.db, 'ana', copyId!))!
  expect(copy).toMatchObject({
    title: 'BH de novo',
    destination: 'Belo Horizonte',
    destinationLat: -19.9,
    startDate: '2028-01-10',
    endDate: '2028-01-12',
    timezone: 'America/Sao_Paulo',
    role: 'owner',
    revision: 0,
  })
  expect(copy.members.map((m) => m.userId)).toEqual(['ana'])
  expect(copy.days.map((d) => [d.date, d.title])).toEqual([
    ['2028-01-10', null],
    ['2028-01-11', 'Centro'],
    ['2028-01-12', null],
  ])
  expect(copy.items.map((i) => [i.title, i.dayId, i.startTime, i.notes, i.done, i.osmRef])).toEqual(
    expect.arrayContaining([
      ['Mercado', copy.days[1]!.id, '10:00', 'Queijo', false, 'W1'],
      ['Ideia', null, null, null, false, null],
    ]),
  )
  expect(copy.items).toHaveLength(2)
  expect(copy.items.map((i) => i.id)).not.toContain(kept)
  expect((await getTrip(t.db, 'owner', tripId))!.items).toHaveLength(2)
})

test('only what someone can see can be copied, with a real date and a name', async () => {
  expect(await duplicateTrip(t.db, 'stranger', tripId, wanted)).toBeNull()
  await expect(
    duplicateTrip(t.db, 'owner', tripId, { ...wanted, startDate: '2028-02-31' }),
  ).rejects.toThrow()
  await expect(duplicateTrip(t.db, 'owner', tripId, { ...wanted, title: ' ' })).rejects.toThrow()
})
