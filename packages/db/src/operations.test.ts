import { randomUUID } from 'node:crypto'
import type { Operation } from '@tripforge/core'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { activityLog, items, tripMembers, users } from './index'
import { applyOperation, OperationError } from './operations'
import { createTestDb, type TestDb } from './testing'
import { createTrip, getTrip, listTrips } from './trips'

let t: TestDb
let tripId: string
let dayIds: string[]

beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())

beforeEach(async () => {
  await t.reset()
  await t.db.insert(users).values(
    ['owner', 'editor', 'viewer', 'stranger'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
    })),
  )
  tripId = await createTrip(t.db, 'owner', {
    title: 'BH',
    destination: 'Belo Horizonte',
    startDate: '2027-03-04',
    endDate: '2027-03-06',
    timezone: 'America/Sao_Paulo',
  })
  await t.db.insert(tripMembers).values([
    { tripId, userId: 'editor', role: 'editor' },
    { tripId, userId: 'viewer', role: 'viewer' },
  ])
  dayIds = (await getTrip(t.db, 'owner', tripId))!.days.map((d) => d.id)
})

const apply = (op: Operation, userId = 'owner', opId: string = randomUUID()) =>
  applyOperation(t.db, { userId, tripId, opId, op })
const snapshot = async () => (await getTrip(t.db, 'owner', tripId))!
const code = (c: string) => ({ code: c })

async function add(title: string, dayId: string | null = dayIds[0]!, position = 'a0') {
  const itemId = randomUUID()
  await apply({ type: 'item.create', itemId, dayId, position, title, kind: 'activity' })
  return itemId
}
const titles = async (dayId: string | null) =>
  (await snapshot()).items.filter((i) => i.dayId === dayId).map((i) => i.title)

describe('trips', () => {
  test('a new trip has its days, its owner and revision 0', async () => {
    const trip = await snapshot()
    expect(trip.days.map((d) => d.date)).toEqual(['2027-03-04', '2027-03-05', '2027-03-06'])
    expect(trip).toMatchObject({ revision: 0, role: 'owner', items: [] })
  })
  test('only members can open it', async () => {
    expect(await getTrip(t.db, 'stranger', tripId)).toBeNull()
    expect((await getTrip(t.db, 'viewer', tripId))?.role).toBe('viewer')
  })
  test('an id that is not a uuid is simply not found', async () => {
    expect(await getTrip(t.db, 'owner', 'nope')).toBeNull()
  })
  test('each person lists only their own trips', async () => {
    expect((await listTrips(t.db, 'editor')).map((x) => x.id)).toEqual([tripId])
    expect(await listTrips(t.db, 'stranger')).toEqual([])
  })
})

describe('permission', () => {
  const create = (): Operation => ({
    type: 'item.create',
    itemId: randomUUID(),
    dayId: null,
    position: 'a0',
    title: 'X',
    kind: 'other',
  })
  test('an editor can write', async () => {
    await expect(apply(create(), 'editor')).resolves.toMatchObject({ revision: 1 })
  })
  test.each(['viewer', 'stranger'])('a %s cannot, and nothing is recorded', async (who) => {
    await expect(apply(create(), who)).rejects.toMatchObject(code('forbidden'))
    expect(await snapshot()).toMatchObject({ revision: 0, items: [] })
  })
  test('only the owner can archive', async () => {
    await expect(
      apply({ type: 'trip.update', fields: { archived: true } }, 'editor'),
    ).rejects.toMatchObject(code('forbidden'))
    await apply({ type: 'trip.update', fields: { archived: true } })
    expect((await snapshot()).archivedAt).not.toBeNull()
  })
  test('an item of another trip is out of reach', async () => {
    const other = await createTrip(t.db, 'owner', {
      title: 'B',
      destination: 'B',
      startDate: '2027-03-04',
      endDate: '2027-03-04',
      timezone: 'UTC',
    })
    const itemId = await add('A')
    await expect(
      applyOperation(t.db, {
        userId: 'owner',
        tripId: other,
        opId: randomUUID(),
        op: { type: 'item.delete', itemId },
      }),
    ).rejects.toMatchObject(code('not_found'))
  })
})

describe('the log', () => {
  test('gives each operation the next revision', async () => {
    await add('A')
    await add('B')
    const log = await t.db.select().from(activityLog).orderBy(asc(activityLog.revision))
    expect(log.map((l) => [l.revision, l.action])).toEqual([
      [1, 'item.create'],
      [2, 'item.create'],
    ])
  })
  test('a retried operation is applied once and gets the same answer', async () => {
    const opId = randomUUID()
    const op: Operation = {
      type: 'item.create',
      itemId: randomUUID(),
      dayId: null,
      position: 'a0',
      title: 'A',
      kind: 'food',
    }
    const first = await apply(op, 'owner', opId)
    expect(await apply(op, 'owner', opId)).toEqual(first)
    expect(await snapshot()).toMatchObject({ revision: 1 })
  })
  test('a failed operation leaves no gap', async () => {
    await expect(apply({ type: 'item.delete', itemId: randomUUID() })).rejects.toBeInstanceOf(
      OperationError,
    )
    await add('A')
    expect((await snapshot()).revision).toBe(1)
  })
})

describe('items', () => {
  test('two items dropped on the same spot get different positions', async () => {
    await add('A', dayIds[0]!, 'a0')
    await add('C', dayIds[0]!, 'a1')
    await add('B', dayIds[0]!, 'a0')
    expect(await titles(dayIds[0]!)).toEqual(['A', 'B', 'C'])
    const pos = (await snapshot()).items.map((i) => i.position)
    expect(new Set(pos).size).toBe(3)
  })
  test('an update changes only what was sent and raises the version', async () => {
    const itemId = await add('A')
    await apply({ type: 'item.update', itemId, baseVersion: 1, fields: { notes: 'levar câmera' } })
    expect((await snapshot()).items[0]).toMatchObject({
      title: 'A',
      notes: 'levar câmera',
      version: 2,
      updatedBy: 'owner',
    })
  })
  test('edits of different fields from the same version both survive', async () => {
    const itemId = await add('A')
    await apply(
      { type: 'item.update', itemId, baseVersion: 1, fields: { title: 'Museu' } },
      'owner',
    )
    await apply(
      { type: 'item.update', itemId, baseVersion: 1, fields: { startTime: '09:30' } },
      'editor',
    )
    expect((await snapshot()).items[0]).toMatchObject({
      title: 'Museu',
      startTime: '09:30',
      version: 3,
    })
  })
  test('moves between days and back to ideas', async () => {
    const itemId = await add('A')
    await apply({ type: 'item.move', itemId, dayId: dayIds[2]!, position: 'a0' })
    expect(await titles(dayIds[2]!)).toEqual(['A'])
    await apply({ type: 'item.move', itemId, dayId: null, position: 'a0' })
    expect(await titles(null)).toEqual(['A'])
  })
  test('moving to its own spot does not push it away from itself', async () => {
    const itemId = await add('A')
    await apply({ type: 'item.move', itemId, dayId: dayIds[0]!, position: 'a0' })
    expect((await snapshot()).items[0]?.position).toBe('a0')
  })
  test('cannot move to a day of another trip', async () => {
    const itemId = await add('A')
    await expect(
      apply({ type: 'item.move', itemId, dayId: randomUUID(), position: 'a0' }),
    ).rejects.toMatchObject(code('not_found'))
  })
  test('a deleted item disappears, refuses edits and can come back', async () => {
    const itemId = await add('A')
    await apply({ type: 'item.delete', itemId })
    expect((await snapshot()).items).toEqual([])
    await expect(
      apply({ type: 'item.update', itemId, baseVersion: 1, fields: { title: 'B' } }),
    ).rejects.toMatchObject(code('deleted'))
    await apply({ type: 'item.restore', itemId })
    expect(await titles(dayIds[0]!)).toEqual(['A'])
  })
  test('a restored item whose spot was taken lands next to it', async () => {
    const itemId = await add('A')
    await apply({ type: 'item.delete', itemId })
    await add('B', dayIds[0]!, 'a0')
    await apply({ type: 'item.restore', itemId })
    expect((await titles(dayIds[0]!)).sort()).toEqual(['A', 'B'])
    expect(new Set((await snapshot()).items.map((i) => i.position)).size).toBe(2)
  })
  test('the end time goes when the start time goes', async () => {
    const itemId = await add('A')
    await apply({
      type: 'item.update',
      itemId,
      baseVersion: 1,
      fields: { startTime: '09:30', endTime: '10:30' },
    })
    await apply({ type: 'item.update', itemId, baseVersion: 2, fields: { startTime: null } })
    expect((await snapshot()).items[0]).toMatchObject({ startTime: null, endTime: null })
  })
})

describe('changing the dates', () => {
  const dates = (startDate: string, endDate: string) =>
    apply({ type: 'trip.update', fields: { startDate, endDate } })

  test('same length: the days move along with their items', async () => {
    await add('A')
    await apply({ type: 'day.update', dayId: dayIds[0]!, fields: { title: 'Chegada' } })
    await dates('2027-03-05', '2027-03-07')
    const trip = await snapshot()
    expect(trip.days.map((d) => d.date)).toEqual(['2027-03-05', '2027-03-06', '2027-03-07'])
    expect(trip.days[0]).toMatchObject({ id: dayIds[0], title: 'Chegada' })
    expect(await titles(dayIds[0]!)).toEqual(['A'])
  })
  test('shorter: items of the removed days go to ideas, after the ones already there', async () => {
    await add('Ideia', null, 'a0')
    await add('A', dayIds[2]!, 'a0')
    await add('B', dayIds[2]!, 'a1')
    await dates('2027-03-04', '2027-03-05')
    expect((await snapshot()).days).toHaveLength(2)
    expect(await titles(null)).toEqual(['Ideia', 'A', 'B'])
  })
  test('shorter: a deleted item does not block it, and comes back as an idea', async () => {
    const itemId = await add('A', dayIds[2]!)
    await apply({ type: 'item.delete', itemId })
    await dates('2027-03-04', '2027-03-05')
    await apply({ type: 'item.restore', itemId })
    expect(await titles(null)).toEqual(['A'])
  })
  test('longer: empty days are added and the others stay', async () => {
    await add('A')
    await dates('2027-03-03', '2027-03-06')
    const trip = await snapshot()
    expect(trip.days.map((d) => d.date)).toEqual([
      '2027-03-03',
      '2027-03-04',
      '2027-03-05',
      '2027-03-06',
    ])
    expect(trip.days[1]?.id).toBe(dayIds[0])
  })
  test('only one end sent: it is checked against the other', async () => {
    await expect(
      apply({ type: 'trip.update', fields: { endDate: '2027-03-01' } }),
    ).rejects.toMatchObject(code('invalid'))
  })
})

test('a deleted row stays in the table', async () => {
  const itemId = await add('A')
  await apply({ type: 'item.delete', itemId })
  expect(
    await t.db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tripId, tripId))),
  ).toHaveLength(1)
})
