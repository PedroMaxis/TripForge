import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { deleteAccount, exportAccount } from './account'
import { accounts, itemVotes, sessions, tripMembers, trips, users, verifications } from './index'
import { getLog } from './log'
import { createInvite, findInvite } from './members'
import { applyOperation } from './operations'
import { createTestDb, type TestDb } from './testing'
import { createTrip, getTrip, listTrips } from './trips'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())
beforeEach(async () => {
  await t.reset()
  await t.db.insert(users).values(
    ['ana', 'bob', 'cris'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      image: 'x',
    })),
  )
})
async function newTrip(...members: [string, 'editor' | 'viewer'][]) {
  const tripId = await createTrip(t.db, 'ana', {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'UTC',
  })
  for (const [i, [userId, role]] of members.entries())
    await t.db
      .insert(tripMembers)
      .values({ tripId, userId, role, joinedAt: new Date(Date.UTC(2027, 0, i + 1)) })
  return tripId
}
const remove = (id = 'ana') => deleteAccount(t.db, id, 'Conta excluída')

test('leaves nothing that says who it was, and no way back in', async () => {
  const soon = new Date(Date.now() + 1e6)
  await t.db.insert(sessions).values({ id: 's', token: 't', userId: 'ana', expiresAt: soon })
  await t.db
    .insert(accounts)
    .values({ id: 'a', userId: 'ana', providerId: 'credential', accountId: 'ana', password: 'h' })
  await t.db
    .insert(verifications)
    .values({ id: 'v', identifier: 'reset-password:x', value: 'ana', expiresAt: soon })
  await remove()
  expect(await t.db.select().from(sessions)).toEqual([])
  expect(await t.db.select().from(accounts)).toEqual([])
  expect(await t.db.select().from(verifications)).toEqual([])
  const [ghost] = await t.db.select().from(users).where(eq(users.id, 'ana'))
  expect(ghost).toMatchObject({ name: 'Conta excluída', image: null })
  expect(ghost?.email).not.toContain('ana@')
  await t.db.insert(users).values({ id: 'new', name: 'Ana', email: 'ana@example.com' })
})

test('a trip only they planned is gone, also for who looked', async () => {
  const tripId = await newTrip(['cris', 'viewer'])
  const { token } = await createInvite(t.db, 'ana', tripId, 'viewer')
  await remove()
  expect(await getTrip(t.db, 'cris', tripId)).toBeNull()
  expect((await findInvite(t.db, token)).status).toBe('unknown')
  expect(await t.db.select().from(trips)).toEqual([])
})

test('a trip planned with others goes to whoever has planned it longest', async () => {
  const tripId = await newTrip(['cris', 'viewer'], ['bob', 'editor'])
  const { token } = await createInvite(t.db, 'ana', tripId, 'editor')
  await remove()
  const trip = (await getTrip(t.db, 'bob', tripId))!
  expect(trip.role).toBe('owner')
  expect(trip.members.map((m) => [m.userId, m.role])).toEqual([
    ['cris', 'viewer'],
    ['bob', 'owner'],
  ])
  expect((await findInvite(t.db, token)).status).toBe('revoked')
  const log = await getLog(t.db, 'bob', tripId, 0)
  expect(log!.entries.map((e) => e.op)).toEqual([
    { type: 'member.changed', userId: 'bob', role: 'owner' },
    { type: 'member.changed', userId: 'ana', role: null },
  ])
  expect(trip.revision).toBe(2)
})

test('what others count on stays, without the name', async () => {
  const tripId = await newTrip(['bob', 'editor'])
  const itemId = randomUUID()
  const apply = (op: Parameters<typeof applyOperation>[1]['op']) =>
    applyOperation(t.db, { userId: 'ana', tripId, opId: randomUUID(), op })
  await apply({
    type: 'item.create',
    itemId,
    dayId: null,
    position: 'a0',
    title: 'X',
    kind: 'other',
  })
  await apply({ type: 'item.vote', itemId, on: true })
  const taskId = randomUUID()
  await apply({ type: 'task.create', taskId, list: 'todo', title: 'T' })
  await apply({ type: 'task.update', taskId, fields: { assigneeId: 'ana' } })
  await apply({
    type: 'expense.create',
    expenseId: randomUUID(),
    fields: {
      title: 'E',
      amount: 100,
      currency: 'BRL',
      paidBy: 'ana',
      split: ['ana', 'bob'],
      date: '2027-03-04',
      payment: false,
    },
  })
  await remove()
  const { group, items } = (await getTrip(t.db, 'bob', tripId))!
  expect(items).toHaveLength(1)
  expect(group?.expenses).toHaveLength(1)
  expect(group?.people).toEqual({ ana: 'Conta excluída', bob: 'bob' })
  expect(group?.tasks[0]?.assigneeId).toBeNull()
  expect(await t.db.select().from(itemVotes)).toEqual([])
})

test('someone who only took part just leaves', async () => {
  const tripId = await newTrip(['bob', 'editor'])
  await remove('bob')
  expect((await listTrips(t.db, 'ana')).map((x) => x.members.length)).toEqual([1])
  expect((await getLog(t.db, 'ana', tripId, 0))!.entries[0]?.op).toEqual({
    type: 'member.changed',
    userId: 'bob',
    role: null,
  })
})

test('a person can take their data along, and nobody else’s', async () => {
  const own = await newTrip()
  const data = await exportAccount(t.db, 'ana')
  expect(data).toMatchObject({ account: { name: 'ana', email: 'ana@example.com' } })
  expect(data?.trips.map((x) => x.id)).toEqual([own])
  expect((await exportAccount(t.db, 'bob'))?.trips).toEqual([])
  expect(JSON.stringify(data)).not.toMatch(/bob@|cris@/)
})
