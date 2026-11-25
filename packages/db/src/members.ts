import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { parseDate, type Role, type Trip } from '@tripforge/core'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { OperationError, record, type Tx } from './change'
import type { AnyDb } from './client'
import { invites, tripMembers, trips, users } from './schema'
import { getTripForGuest } from './trips'

export type InviteRole = Exclude<Role, 'owner'>

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const isLive = () => and(isNull(invites.revokedAt), gt(invites.expiresAt, new Date()))

async function requireOwner(db: AnyDb, userId: string, tripId: string) {
  const [trip] = await db
    .select({ endDate: trips.endDate })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, userId)))
  if (!trip) throw new OperationError('forbidden')
  return trip
}

const dayMs = 86_400_000
const inviteDays = 14
const daysAfterTrip = 30

/** A link to look lasts past the trip, since looking along is what it is for. */
function expiryOf(role: InviteRole, endDate: string) {
  const soon = Date.now() + inviteDays * dayMs
  const afterTrip = parseDate(endDate) + daysAfterTrip * dayMs
  return new Date(role === 'viewer' ? Math.max(soon, afterTrip) : soon)
}

/** The token is shown once, in the link; only its hash is kept. */
export async function createInvite(db: AnyDb, userId: string, tripId: string, role: InviteRole) {
  const trip = await requireOwner(db, userId, tripId)
  const token = randomBytes(32).toString('base64url')
  const [created] = await db
    .insert(invites)
    .values({
      tripId,
      tokenHash: hash(token),
      role,
      expiresAt: expiryOf(role, trip.endDate),
      createdBy: userId,
    })
    .returning({ id: invites.id })
  return { id: created!.id, token }
}

export async function listInvites(db: AnyDb, userId: string, tripId: string) {
  await requireOwner(db, userId, tripId)
  return db
    .select({ id: invites.id, role: invites.role, expiresAt: invites.expiresAt })
    .from(invites)
    .where(and(eq(invites.tripId, tripId), isLive()))
    .orderBy(asc(invites.createdAt))
}

export async function revokeInvite(db: AnyDb, userId: string, tripId: string, inviteId: string) {
  await requireOwner(db, userId, tripId)
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.tripId, tripId), isNull(invites.revokedAt)))
}

export type FoundInvite =
  | { status: 'ok'; tripId: string; title: string; inviter: string; role: InviteRole }
  | { status: 'unknown' | 'revoked' | 'expired' }

export async function findInvite(db: AnyDb, token: string): Promise<FoundInvite> {
  const [found] = await db
    .select({ invite: invites, title: trips.title, inviter: users.name })
    .from(invites)
    .innerJoin(trips, eq(trips.id, invites.tripId))
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(eq(invites.tokenHash, hash(token)))
  if (!found) return { status: 'unknown' }
  if (found.invite.revokedAt) return { status: 'revoked' }
  if (found.invite.expiresAt <= new Date()) return { status: 'expired' }
  return {
    status: 'ok',
    tripId: found.invite.tripId,
    title: found.title,
    inviter: found.inviter,
    role: found.invite.role as InviteRole,
  }
}

export type SharedTrip =
  | { status: 'ok'; trip: Trip }
  | { status: 'unknown' | 'revoked' | 'expired' }

/** What a view link shows to whoever has it. An edit link shows nothing this way. */
export async function getSharedTrip(db: AnyDb, token: string): Promise<SharedTrip> {
  const found = await findInvite(db, token)
  if (found.status !== 'ok') return { status: found.status }
  if (found.role !== 'viewer') return { status: 'unknown' }
  const trip = await getTripForGuest(db, found.tripId)
  return trip ? { status: 'ok', trip } : { status: 'unknown' }
}

async function lockTrip(tx: Tx, tripId: string) {
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update')
  if (!trip) throw new OperationError('not_found')
  return trip
}

async function roleOf(tx: Tx, tripId: string, userId: string) {
  const [member] = await tx
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
  return member?.role
}

export function recordMember(
  tx: Tx,
  trip: { id: string; revision: number },
  actorId: string,
  userId: string,
  role: Role | null,
) {
  const revision = trip.revision + 1
  return record(tx, {
    tripId: trip.id,
    revision,
    opId: randomUUID(),
    userId: actorId,
    action: 'member.changed',
    payload: { op: { type: 'member.changed', userId, role }, result: { revision } },
  })
}

export async function acceptInvite(db: AnyDb, userId: string, token: string) {
  return db.transaction(async (tx) => {
    const found = await findInvite(tx, token)
    if (found.status !== 'ok') throw new OperationError('not_found')
    const trip = await lockTrip(tx, found.tripId)
    // It may have been revoked while this was waiting for the lock.
    const invite = await findInvite(tx, token)
    if (invite.status !== 'ok') throw new OperationError('not_found')

    const current = await roleOf(tx, trip.id, userId)
    const raises = current === 'viewer' && invite.role === 'editor'
    if (current && !raises) return trip.id
    await tx
      .insert(tripMembers)
      .values({ tripId: trip.id, userId, role: invite.role })
      .onConflictDoUpdate({
        target: [tripMembers.tripId, tripMembers.userId],
        set: { role: invite.role },
      })
    await recordMember(tx, trip, userId, userId, invite.role)
    return trip.id
  })
}

/** Changes a role, or removes the person with null. People may also remove themselves. */
export async function changeMember(
  db: AnyDb,
  actorId: string,
  tripId: string,
  userId: string,
  role: InviteRole | null,
) {
  await db.transaction(async (tx) => {
    const trip = await lockTrip(tx, tripId)
    const leaving = actorId === userId && role === null
    if (trip.ownerId !== actorId && !leaving) throw new OperationError('forbidden')
    const current = await roleOf(tx, tripId, userId)
    if (!current) throw new OperationError('not_found')
    if (current === 'owner') throw new OperationError('forbidden')
    if (current === role) return

    const member = and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId))
    if (role) {
      await tx.update(tripMembers).set({ role }).where(member)
    } else {
      await tx.delete(tripMembers).where(member)
      if (!leaving) {
        // Otherwise the person could come straight back through an old link.
        await tx
          .update(invites)
          .set({ revokedAt: new Date() })
          .where(and(eq(invites.tripId, tripId), isNull(invites.revokedAt)))
      }
    }
    await recordMember(tx, trip, actorId, userId, role)
  })
}
