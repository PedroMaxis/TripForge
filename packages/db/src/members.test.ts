import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { activityLog, invites, tripMembers, trips, users } from './index'
import {
  acceptInvite,
  changeMember,
  createInvite,
  findInvite,
  getSharedTrip,
  listInvites,
  revokeInvite,
} from './members'
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
  await t.db.insert(users).values(
    ['owner', 'editor', 'viewer', 'guest'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
    })),
  )
  tripId = await createTrip(t.db, 'owner', {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'UTC',
  })
  await t.db.insert(tripMembers).values([
    { tripId, userId: 'editor', role: 'editor' },
    { tripId, userId: 'viewer', role: 'viewer' },
  ])
})
const code = (c: string) => ({ code: c })
const invite = (role: 'editor' | 'viewer' = 'editor') => createInvite(t.db, 'owner', tripId, role)
const roleOf = async (userId: string) =>
  (
    await t.db
      .select()
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
  )[0]?.role

describe('inviting', () => {
  test('the token is never stored', async () => {
    const { token } = await invite()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(JSON.stringify(await t.db.select().from(invites))).not.toContain(token)
  })
  test.each(['editor', 'viewer', 'guest'])('an %s cannot invite, list or revoke', async (who) => {
    const { id } = await invite()
    await expect(createInvite(t.db, who, tripId, 'viewer')).rejects.toMatchObject(code('forbidden'))
    await expect(listInvites(t.db, who, tripId)).rejects.toMatchObject(code('forbidden'))
    await expect(revokeInvite(t.db, who, tripId, id)).rejects.toMatchObject(code('forbidden'))
  })
  test('only live invites are listed', async () => {
    const a = await invite()
    const b = await invite('viewer')
    await revokeInvite(t.db, 'owner', tripId, a.id)
    expect((await listInvites(t.db, 'owner', tripId)).map((i) => i.id)).toEqual([b.id])
  })
})

describe('opening a link', () => {
  test('says which trip, who invited and as what', async () => {
    const { token } = await invite('viewer')
    expect(await findInvite(t.db, token)).toEqual({
      status: 'ok',
      tripId,
      title: 'BH',
      inviter: 'owner',
      role: 'viewer',
    })
  })
  test('an unknown token says nothing', async () => {
    expect(await findInvite(t.db, 'nope')).toEqual({ status: 'unknown' })
  })
  test('a revoked or expired one does not work', async () => {
    const a = await invite()
    await revokeInvite(t.db, 'owner', tripId, a.id)
    expect(await findInvite(t.db, a.token)).toEqual({ status: 'revoked' })
    const b = await invite()
    await t.db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.id, b.id))
    expect(await findInvite(t.db, b.token)).toEqual({ status: 'expired' })
    for (const { token } of [a, b])
      await expect(acceptInvite(t.db, 'guest', token)).rejects.toMatchObject(code('not_found'))
    expect(await roleOf('guest')).toBeUndefined()
  })
})

describe('accepting', () => {
  test('adds the person with the role of the link and logs it', async () => {
    const { token } = await invite('viewer')
    expect(await acceptInvite(t.db, 'guest', token)).toBe(tripId)
    expect(await roleOf('guest')).toBe('viewer')
    const [log] = await t.db.select().from(activityLog)
    expect(log).toMatchObject({
      action: 'member.changed',
      userId: 'guest',
      revision: 1,
      payload: { op: { userId: 'guest', role: 'viewer' } },
    })
    expect((await getTrip(t.db, 'owner', tripId))?.revision).toBe(1)
  })
  test('the same link works for several people', async () => {
    const { token } = await invite()
    await t.db.insert(users).values({ id: 'guest2', name: 'g', email: 'g2@example.com' })
    await acceptInvite(t.db, 'guest', token)
    await acceptInvite(t.db, 'guest2', token)
    expect([await roleOf('guest'), await roleOf('guest2')]).toEqual(['editor', 'editor'])
  })
  test('raises a viewer but never lowers anyone', async () => {
    await acceptInvite(t.db, 'viewer', (await invite('editor')).token)
    expect(await roleOf('viewer')).toBe('editor')
    const { token } = await invite('viewer')
    await acceptInvite(t.db, 'editor', token)
    await acceptInvite(t.db, 'owner', token)
    expect([await roleOf('editor'), await roleOf('owner')]).toEqual(['editor', 'owner'])
  })
  test('accepting again changes nothing', async () => {
    const { token } = await invite()
    await acceptInvite(t.db, 'guest', token)
    await acceptInvite(t.db, 'guest', token)
    expect(await t.db.select().from(activityLog)).toHaveLength(1)
  })
})

describe('members', () => {
  test('the owner changes a role', async () => {
    await changeMember(t.db, 'owner', tripId, 'viewer', 'editor')
    expect(await roleOf('viewer')).toBe('editor')
  })
  test('the owner removes someone, and live links die with it', async () => {
    const { token } = await invite()
    await changeMember(t.db, 'owner', tripId, 'editor', null)
    expect(await roleOf('editor')).toBeUndefined()
    await expect(acceptInvite(t.db, 'editor', token)).rejects.toMatchObject(code('not_found'))
  })
  test('anyone but the owner can leave, and links stay', async () => {
    const { token } = await invite()
    await changeMember(t.db, 'viewer', tripId, 'viewer', null)
    expect(await roleOf('viewer')).toBeUndefined()
    expect((await findInvite(t.db, token)).status).toBe('ok')
    await expect(changeMember(t.db, 'owner', tripId, 'owner', null)).rejects.toMatchObject(
      code('forbidden'),
    )
  })
  test('nobody else can manage people, or promote themselves', async () => {
    await expect(changeMember(t.db, 'editor', tripId, 'viewer', null)).rejects.toMatchObject(
      code('forbidden'),
    )
    await expect(changeMember(t.db, 'viewer', tripId, 'viewer', 'editor')).rejects.toMatchObject(
      code('forbidden'),
    )
    await expect(changeMember(t.db, 'guest', tripId, 'viewer', null)).rejects.toMatchObject(
      code('forbidden'),
    )
  })
  test('the owner role cannot be taken or given', async () => {
    await expect(changeMember(t.db, 'owner', tripId, 'owner', 'viewer')).rejects.toMatchObject(
      code('forbidden'),
    )
  })
  test('someone who is not a member is not found', async () => {
    await expect(changeMember(t.db, 'owner', tripId, 'guest', 'viewer')).rejects.toMatchObject(
      code('not_found'),
    )
  })
})

describe('seeing without an account', () => {
  test('a view link opens the trip, and tells nothing about the people', async () => {
    const { token } = await invite('viewer')
    const shared = await getSharedTrip(t.db, token)
    expect(shared).toMatchObject({
      status: 'ok',
      trip: { id: tripId, title: 'BH', role: 'viewer', members: [] },
    })
    for (const name of ['owner', 'editor', '@example.com'])
      expect(JSON.stringify(shared)).not.toContain(`"${name}"`)
  })
  test('the itinerary comes without ideas, and without who changed it last', async () => {
    const { token } = await invite('viewer')
    const [day] = (await getTrip(t.db, 'owner', tripId))!.days
    const itemId = randomUUID()
    const ideaId = randomUUID()
    await applyOperation(t.db, {
      userId: 'editor',
      tripId,
      opId: randomUUID(),
      op: {
        type: 'item.create',
        itemId: ideaId,
        dayId: null,
        position: 'a0',
        title: 'Ideia',
        kind: 'other',
      },
    })
    await applyOperation(t.db, {
      userId: 'editor',
      tripId,
      opId: randomUUID(),
      op: {
        type: 'item.create',
        itemId,
        dayId: day!.id,
        position: 'a0',
        title: 'Museu',
        kind: 'other',
      },
    })
    const shared = await getSharedTrip(t.db, token)
    expect(shared.status === 'ok' && shared.trip.items).toMatchObject([
      { title: 'Museu', updatedBy: null },
    ])
  })
  test('an edit link does not, and neither does nonsense', async () => {
    expect(await getSharedTrip(t.db, (await invite('editor')).token)).toEqual({ status: 'unknown' })
    expect(await getSharedTrip(t.db, 'nope')).toEqual({ status: 'unknown' })
  })
  test('a revoked or expired link shows nothing', async () => {
    const a = await invite('viewer')
    await revokeInvite(t.db, 'owner', tripId, a.id)
    expect(await getSharedTrip(t.db, a.token)).toEqual({ status: 'revoked' })
    const b = await invite('viewer')
    await t.db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.id, b.id))
    expect(await getSharedTrip(t.db, b.token)).toEqual({ status: 'expired' })
  })
  test('removing a member kills view links too', async () => {
    const { token } = await invite('viewer')
    await changeMember(t.db, 'owner', tripId, 'editor', null)
    expect(await getSharedTrip(t.db, token)).toEqual({ status: 'revoked' })
  })
})

describe('how long a link lasts', () => {
  const daysLeft = async (id: string) => {
    const [row] = await t.db.select().from(invites).where(eq(invites.id, id))
    return Math.round((row!.expiresAt.getTime() - Date.now()) / 86_400_000)
  }
  test('an edit link, two weeks', async () => {
    expect(await daysLeft((await invite('editor')).id)).toBe(14)
  })
  test('a view link, until a month after the trip', async () => {
    const { shiftDate } = await import('@tripforge/core')
    const end = shiftDate(new Date().toISOString().slice(0, 10), 100)
    await t.db.update(trips).set({ startDate: end, endDate: end }).where(eq(trips.id, tripId))
    const left = await daysLeft((await invite('viewer')).id)
    expect(left).toBeGreaterThanOrEqual(130)
    expect(left).toBeLessThanOrEqual(131)
  })
  test('a view link of a past trip, still two weeks', async () => {
    await t.db
      .update(trips)
      .set({ startDate: '2020-01-01', endDate: '2020-01-02' })
      .where(eq(trips.id, tripId))
    expect(await daysLeft((await invite('viewer')).id)).toBe(14)
  })
})
