import type { LogEntry, OperationResult, Role } from '@tripforge/core'
import { and, asc, desc, eq, gt, type SQL } from 'drizzle-orm'
import type { AnyDb } from './client'
import { activityLog, tripMembers, trips, users } from './schema'
import { isUuid } from './trips'

const logLimit = 200

/** Someone's role in a trip and where the trip is now, or null when it is not theirs to see. */
export async function tripAccess(
  db: AnyDb,
  userId: string,
  tripId: string,
): Promise<{ role: Role; revision: number } | null> {
  if (!isUuid(tripId)) return null
  const [found] = await db
    .select({ role: tripMembers.role, revision: trips.revision })
    .from(tripMembers)
    .innerJoin(trips, eq(trips.id, tripMembers.tripId))
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
  return found ?? null
}

async function read(db: AnyDb, where: SQL | undefined, order: SQL, limit?: number) {
  const query = db
    .select({ log: activityLog, userName: users.name })
    .from(activityLog)
    .innerJoin(users, eq(users.id, activityLog.userId))
    .where(where)
    .orderBy(order)
  const rows = await (limit ? query.limit(limit) : query)
  return rows.map(({ log, userName }): LogEntry => {
    const { op, result } = log.payload as { op: LogEntry['op']; result: OperationResult }
    return {
      revision: log.revision,
      opId: log.opId,
      userId: log.userId,
      userName,
      at: log.createdAt.toISOString(),
      op,
      ...(result.item && { item: result.item }),
    }
  })
}

const after = (tripId: string, revision: number) =>
  and(eq(activityLog.tripId, tripId), gt(activityLog.revision, revision))

/** For the realtime server, which has already checked who is listening. */
export const entriesSince = (db: AnyDb, tripId: string, revision: number) =>
  read(db, after(tripId, revision), asc(activityLog.revision))

/** What someone missed, or word that they missed too much and should load the trip again. */
export async function getLog(
  db: AnyDb,
  userId: string,
  tripId: string,
  revision: number,
  limit = logLimit,
) {
  if (!(await tripAccess(db, userId, tripId))) return null
  const entries = await read(db, after(tripId, revision), asc(activityLog.revision), limit + 1)
  return entries.length > limit ? { entries: [], reset: true } : { entries, reset: false }
}

export async function recentLog(db: AnyDb, userId: string, tripId: string, limit = logLimit) {
  if (!(await tripAccess(db, userId, tripId))) return null
  return read(db, eq(activityLog.tripId, tripId), desc(activityLog.revision), limit)
}
