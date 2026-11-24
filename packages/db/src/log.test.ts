import { randomUUID } from 'node:crypto'
import type { Operation } from '@tripforge/core'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { activityLog, tripMembers, users } from './index'
import { entriesSince, getLog, recentLog, tripAccess } from './log'
import { changeMember } from './members'
import { applyOperation } from './operations'
import { createTestDb, type TestDb } from './testing'
import { createTrip, getTrip } from './trips'

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
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'UTC',
  })
  await t.db.insert(tripMembers).values({ tripId, userId: 'ana', role: 'editor' })
})
const apply = (op: Operation, userId = 'owner', queued = false) =>
  applyOperation(t.db, { userId, tripId, opId: randomUUID(), op, queued })
async function add(title = 'Museu') {
  const itemId = randomUUID()
  await apply({ type: 'item.create', itemId, dayId: null, position: 'a0', title, kind: 'other' })
  return itemId
}
const update = (itemId: string, baseVersion: number, fields: object) =>
  ({ type: 'item.update', itemId, baseVersion, fields }) as Operation

describe('the log', () => {
  test('gives what happened after a revision, in order, with names', async () => {
    await add('A')
    await add('B')
    const log = await getLog(t.db, 'ana', tripId, 1)
    expect(log?.entries).toMatchObject([
      {
        revision: 2,
        userName: 'owner',
        op: { type: 'item.create', title: 'B' },
        item: { title: 'B' },
      },
    ])
  })
  test('says to start over when too much happened', async () => {
    for (let i = 0; i < 4; i++) await add(`${i}`)
    expect(await getLog(t.db, 'owner', tripId, 0, 3)).toEqual({ entries: [], reset: true })
  })
  test('is closed to strangers', async () => {
    expect(await getLog(t.db, 'stranger', tripId, 0)).toBeNull()
    expect(await recentLog(t.db, 'stranger', tripId)).toBeNull()
  })
  test('people changes are in it', async () => {
    await changeMember(t.db, 'owner', tripId, 'ana', 'viewer')
    expect(await entriesSince(t.db, tripId, 0)).toMatchObject([
      { op: { type: 'member.changed', userId: 'ana', role: 'viewer' } },
    ])
  })
  test('the history shows the newest first', async () => {
    await add('A')
    await add('B')
    expect((await recentLog(t.db, 'owner', tripId))?.map((e) => e.revision)).toEqual([2, 1])
  })
})

test('access tells the role and the revision', async () => {
  await add()
  expect(await tripAccess(t.db, 'ana', tripId)).toEqual({ role: 'editor', revision: 1 })
  expect(await tripAccess(t.db, 'stranger', tripId)).toBeNull()
  expect(await tripAccess(t.db, 'ana', 'nope')).toBeNull()
})

describe('edits made offline', () => {
  test('lose to a newer edit of the same field by someone else, who is told', async () => {
    const id = await add()
    await apply(update(id, 1, { title: 'Da Ana' }), 'ana')
    const result = await apply(update(id, 1, { title: 'Meu' }), 'owner', true)
    expect(result.conflict).toEqual({
      itemId: id,
      userName: 'ana',
      mine: { title: 'Meu' },
      theirs: { title: 'Da Ana' },
    })
    expect((await getTrip(t.db, 'owner', tripId))!.items[0]).toMatchObject({
      title: 'Da Ana',
      version: 2,
    })
  })
  test('keep the fields nobody else touched', async () => {
    const id = await add()
    await apply(update(id, 1, { title: 'Da Ana' }), 'ana')
    const result = await apply(update(id, 1, { title: 'Meu', notes: 'levar água' }), 'owner', true)
    expect(result.conflict?.mine).toEqual({ title: 'Meu' })
    expect((await getTrip(t.db, 'owner', tripId))!.items[0]).toMatchObject({
      title: 'Da Ana',
      notes: 'levar água',
    })
  })
  test('a place is all or nothing', async () => {
    const id = await add()
    await apply(update(id, 1, { placeName: 'Savassi', lat: 1, lng: 2, osmRef: 'N1' }), 'ana')
    const result = await apply(
      update(id, 1, { placeName: 'Centro', address: 'Rua X', lat: 3, lng: 4 }),
      'owner',
      true,
    )
    expect(Object.keys(result.conflict!.mine).sort()).toEqual([
      'address',
      'lat',
      'lng',
      'placeName',
    ])
    expect((await getTrip(t.db, 'owner', tripId))!.items[0]).toMatchObject({
      placeName: 'Savassi',
      address: null,
      lat: 1,
    })
  })
  test('never conflict with your own earlier edits', async () => {
    const id = await add()
    await apply(update(id, 1, { title: 'Um' }))
    const result = await apply(update(id, 1, { title: 'Dois' }), 'owner', true)
    expect(result.conflict).toBeUndefined()
    expect((await getTrip(t.db, 'owner', tripId))!.items[0]?.title).toBe('Dois')
  })
  test('do not conflict when both chose the same', async () => {
    const id = await add()
    await apply(update(id, 1, { title: 'Igual' }), 'ana')
    expect((await apply(update(id, 1, { title: 'Igual' }), 'owner', true)).conflict).toBeUndefined()
  })
  test('a refused edit is still answered the same when retried', async () => {
    const id = await add()
    await apply(update(id, 1, { title: 'Da Ana' }), 'ana')
    const opId = randomUUID()
    const request = {
      userId: 'owner',
      tripId,
      opId,
      op: update(id, 1, { title: 'Meu' }),
      queued: true,
    }
    const first = await applyOperation(t.db, request)
    expect(await applyOperation(t.db, request)).toEqual(first)
    expect((await t.db.select().from(activityLog)).length).toBe(2)
  })
  test('online, the last one to arrive wins', async () => {
    const id = await add()
    await apply(update(id, 1, { title: 'Da Ana' }), 'ana')
    expect((await apply(update(id, 1, { title: 'Meu' }))).conflict).toBeUndefined()
    expect((await getTrip(t.db, 'owner', tripId))!.items[0]?.title).toBe('Meu')
  })
})
