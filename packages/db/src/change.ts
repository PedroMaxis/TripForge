import type { OperationErrorCode, OperationResult } from '@tripforge/core'
import { and, eq, sql } from 'drizzle-orm'
import type { AnyDb } from './client'
import { activityLog, items, tripMembers, trips } from './schema'

export class OperationError extends Error {
  constructor(readonly code: OperationErrorCode) {
    super(code)
  }
}

export type Tx = Parameters<Parameters<AnyDb['transaction']>[0]>[0]
export async function findItem(tx: Tx, tripId: string, itemId: string) {
  const [item] = await tx
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.tripId, tripId)))
  if (!item) throw new OperationError('not_found')
  return item
}

export async function findLiveItem(tx: Tx, tripId: string, itemId: string) {
  const item = await findItem(tx, tripId, itemId)
  if (item.deletedAt) throw new OperationError('deleted')
  return item
}

/** Moves the trip to its next revision, logs what happened and tells the realtime server. */
export async function record(tx: Tx, entry: typeof activityLog.$inferInsert) {
  const { tripId, revision } = entry
  await tx.update(trips).set({ revision }).where(eq(trips.id, tripId))
  await tx.insert(activityLog).values(entry)
  await tx.execute(sql`select pg_notify('trip', ${JSON.stringify({ tripId, revision })})`)
}

/** Locks the trip for someone who may change it, so its changes happen one at a time. */
export async function lockForChange(tx: Tx, userId: string, tripId: string) {
  const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update')
  const [member] = await tx
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
  if (!trip || !member || member.role === 'viewer') throw new OperationError('forbidden')
  return trip
}

/** What came of a change that was already made, if it was. */
export async function pastResult(
  tx: Tx,
  { tripId, userId, opId }: { tripId: string; userId: string; opId: string },
) {
  const [done] = await tx
    .select({ payload: activityLog.payload })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.tripId, tripId),
        eq(activityLog.userId, userId),
        eq(activityLog.opId, opId),
      ),
    )
  return done ? (done.payload as { op: object; result: OperationResult }) : null
}
