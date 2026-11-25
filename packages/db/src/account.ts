import { randomUUID } from 'node:crypto'
import type { Trip } from '@tripforge/core'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { Tx } from './change'
import type { AnyDb } from './client'
import { recordMember } from './members'
import {
  accounts,
  invites,
  itemVotes,
  sessions,
  tasks,
  tripMembers,
  trips,
  users,
  verifications,
} from './schema'
import { getTrip, listTrips } from './trips'

async function leaveTrip(tx: Tx, userId: string, tripId: string) {
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update')
  if (!trip) return
  if (trip.ownerId === userId) {
    const [heir] = await tx
      .select({ userId: tripMembers.userId })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.role, 'editor'),
          ne(tripMembers.userId, userId),
        ),
      )
      .orderBy(asc(tripMembers.joinedAt), asc(tripMembers.userId))
      .limit(1)
    if (!heir) {
      await tx.delete(trips).where(eq(trips.id, tripId))
      return
    }
    await tx.update(trips).set({ ownerId: heir.userId }).where(eq(trips.id, tripId))
    await tx
      .update(tripMembers)
      .set({ role: 'owner' })
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, heir.userId)))
    await recordMember(tx, trip, userId, heir.userId, 'owner')
    trip.revision++
  }
  await tx
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(invites.tripId, tripId), eq(invites.createdBy, userId), isNull(invites.revokedAt)),
    )
  await tx
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
  await recordMember(tx, trip, userId, userId, null)
}

/**
 * Ends an account. Trips planned with others go on without it; an empty shell of the user stays
 * behind, so that what those others wrote and spent still adds up.
 */
export async function deleteAccount(db: AnyDb, userId: string, shellName: string) {
  await db.transaction(async (tx) => {
    const memberships = await tx
      .select({ tripId: tripMembers.tripId })
      .from(tripMembers)
      .where(eq(tripMembers.userId, userId))
      .orderBy(asc(tripMembers.tripId))
    for (const { tripId } of memberships) await leaveTrip(tx, userId, tripId)
    await tx.delete(itemVotes).where(eq(itemVotes.userId, userId))
    await tx.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    await tx.delete(accounts).where(eq(accounts.userId, userId))
    await tx.delete(verifications).where(eq(verifications.value, userId))
    await tx
      .update(users)
      .set({
        name: shellName,
        email: `${randomUUID()}@deleted.invalid`,
        emailVerified: false,
        image: null,
      })
      .where(eq(users.id, userId))
  })
}

/** Everything someone can see here, to keep elsewhere. */
export async function exportAccount(db: AnyDb, userId: string) {
  const [account] = await db
    .select({
      name: users.name,
      email: users.email,
      locale: users.locale,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
  if (!account) return null
  const all: Trip[] = []
  for (const { id } of await listTrips(db, userId)) {
    const trip = await getTrip(db, userId, id)
    if (trip) all.push(trip)
  }
  return { account, trips: all }
}
