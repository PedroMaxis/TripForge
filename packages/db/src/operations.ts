import {
  areTripDates,
  type Conflict,
  clashingFields,
  datesBetween,
  daysApart,
  type Operation,
  type OperationErrorCode,
  type OperationResult,
  positionBetween,
  shiftDate,
  type TripItem,
} from '@tripforge/core'
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { AnyDb } from './client'
import { activityLog, days, items, tripMembers, trips, users } from './schema'
import { toTripItem } from './trips'

export class OperationError extends Error {
  constructor(readonly code: OperationErrorCode) {
    super(code)
  }
}

export type Tx = Parameters<Parameters<AnyDb['transaction']>[0]>[0]
type Op<T extends Operation['type']> = Extract<Operation, { type: T }>

const inList = (tripId: string, dayId: string | null) =>
  and(
    eq(items.tripId, tripId),
    dayId ? eq(items.dayId, dayId) : isNull(items.dayId),
    isNull(items.deletedAt),
  )

/** The wanted position, or one right after it when another item already sits there. */
async function freePosition(
  tx: Tx,
  tripId: string,
  dayId: string | null,
  wanted: string,
  itemId: string,
) {
  const taken = await tx
    .selectDistinct({ position: items.position })
    .from(items)
    .where(and(inList(tripId, dayId), gte(items.position, wanted), ne(items.id, itemId)))
    .orderBy(asc(items.position))
    .limit(2)
  if (taken[0]?.position !== wanted) return wanted
  return positionBetween(wanted, taken[1]?.position ?? null)
}

async function requireDay(tx: Tx, tripId: string, dayId: string | null) {
  if (dayId === null) return
  const [day] = await tx
    .select({ id: days.id })
    .from(days)
    .where(and(eq(days.id, dayId), eq(days.tripId, tripId)))
  if (!day) throw new OperationError('not_found')
}

async function findItem(tx: Tx, tripId: string, itemId: string) {
  const [item] = await tx
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.tripId, tripId)))
  if (!item) throw new OperationError('not_found')
  return item
}

async function findLiveItem(tx: Tx, tripId: string, itemId: string) {
  const item = await findItem(tx, tripId, itemId)
  if (item.deletedAt) throw new OperationError('deleted')
  return item
}

async function saveItem(
  tx: Tx,
  userId: string,
  itemId: string,
  values: Partial<typeof items.$inferInsert>,
) {
  const [saved] = await tx
    .update(items)
    .set({ ...values, version: sql`${items.version} + 1`, updatedBy: userId })
    .where(eq(items.id, itemId))
    .returning()
  return toTripItem(saved!)
}

async function changeDates(
  tx: Tx,
  userId: string,
  tripId: string,
  startDate: string,
  endDate: string,
) {
  const current = await tx
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.date))
  const wanted = datesBetween(startDate, endDate)
  const moved = daysApart(current[0]!.date, startDate)

  if (wanted.length === current.length) {
    // From the far end first, so no two days ever share a date.
    for (const day of moved > 0 ? current.toReversed() : current) {
      await tx
        .update(days)
        .set({ date: shiftDate(day.date, moved) })
        .where(eq(days.id, day.id))
    }
    return
  }

  const removed = current.filter((d) => !wanted.includes(d.date))
  if (removed.length > 0) {
    const [last] = await tx
      .select({ position: items.position })
      .from(items)
      .where(inList(tripId, null))
      .orderBy(desc(items.position))
      .limit(1)
    let position = last?.position ?? null
    for (const day of removed) {
      const orphans = await tx
        .select()
        .from(items)
        .where(eq(items.dayId, day.id))
        .orderBy(asc(items.position), asc(items.id))
      for (const item of orphans) {
        if (!item.deletedAt) position = positionBetween(position, null)
        await saveItem(tx, userId, item.id, {
          dayId: null,
          position: item.deletedAt ? item.position : position!,
        })
      }
    }
    await tx.delete(days).where(
      inArray(
        days.id,
        removed.map((d) => d.id),
      ),
    )
  }
  const added = wanted.filter((date) => !current.some((d) => d.date === date))
  if (added.length > 0) await tx.insert(days).values(added.map((date) => ({ tripId, date })))
}

async function updateTrip(
  tx: Tx,
  userId: string,
  trip: typeof trips.$inferSelect,
  { fields }: Op<'trip.update'>,
) {
  const { archived, ...rest } = fields
  if (archived !== undefined && trip.ownerId !== userId) throw new OperationError('forbidden')
  const startDate = rest.startDate ?? trip.startDate
  const endDate = rest.endDate ?? trip.endDate
  if (startDate !== trip.startDate || endDate !== trip.endDate) {
    if (!areTripDates({ startDate, endDate })) throw new OperationError('invalid')
    await changeDates(tx, userId, trip.id, startDate, endDate)
  }
  await tx
    .update(trips)
    .set({ ...rest, ...(archived !== undefined && { archivedAt: archived ? new Date() : null }) })
    .where(eq(trips.id, trip.id))
}

async function run(
  tx: Tx,
  userId: string,
  trip: typeof trips.$inferSelect,
  op: Operation,
): Promise<TripItem | undefined> {
  const tripId = trip.id
  switch (op.type) {
    case 'trip.update':
      await updateTrip(tx, userId, trip, op)
      return
    case 'day.update':
      await requireDay(tx, tripId, op.dayId)
      await tx.update(days).set(op.fields).where(eq(days.id, op.dayId))
      return
    case 'item.create': {
      await requireDay(tx, tripId, op.dayId)
      const [existing] = await tx
        .select({ id: items.id })
        .from(items)
        .where(eq(items.id, op.itemId))
      if (existing) throw new OperationError('invalid')
      const position = await freePosition(tx, tripId, op.dayId, op.position, op.itemId)
      const [created] = await tx
        .insert(items)
        .values({
          id: op.itemId,
          tripId,
          dayId: op.dayId,
          position,
          title: op.title,
          kind: op.kind,
          ...op.place,
          updatedBy: userId,
        })
        .returning()
      return toTripItem(created!)
    }
    case 'item.update': {
      const item = await findLiveItem(tx, tripId, op.itemId)
      const startTime = op.fields.startTime === undefined ? item.startTime : op.fields.startTime
      return saveItem(tx, userId, item.id, {
        ...op.fields,
        ...(startTime === null && { endTime: null }),
      })
    }
    case 'item.move': {
      const item = await findLiveItem(tx, tripId, op.itemId)
      await requireDay(tx, tripId, op.dayId)
      const position = await freePosition(tx, tripId, op.dayId, op.position, item.id)
      return saveItem(tx, userId, item.id, { dayId: op.dayId, position })
    }
    case 'item.delete': {
      const item = await findLiveItem(tx, tripId, op.itemId)
      return saveItem(tx, userId, item.id, { deletedAt: new Date() })
    }
    case 'item.restore': {
      const item = await findItem(tx, tripId, op.itemId)
      const position = await freePosition(tx, tripId, item.dayId, item.position, item.id)
      return saveItem(tx, userId, item.id, { deletedAt: null, position })
    }
  }
}

/**
 * Splits an edit made offline: fields someone else changed since keep the newer value, the rest
 * goes through.
 */
async function settleQueued(
  tx: Tx,
  userId: string,
  tripId: string,
  op: Op<'item.update'>,
): Promise<{ op: Op<'item.update'> | null; conflict?: Conflict }> {
  const item = toTripItem(await findLiveItem(tx, tripId, op.itemId))
  const log = await tx
    .select({ payload: activityLog.payload, userId: activityLog.userId, name: users.name })
    .from(activityLog)
    .innerJoin(users, eq(users.id, activityLog.userId))
    .where(
      and(
        eq(activityLog.itemId, op.itemId),
        eq(activityLog.action, 'item.update'),
        ne(activityLog.userId, userId),
      ),
    )
    .orderBy(asc(activityLog.revision))
  const changed = new Map<string, string>()
  for (const { payload, name } of log) {
    const past = payload as { op: Op<'item.update'>; result: OperationResult }
    if ((past.result.item?.version ?? 0) <= op.baseVersion) continue
    for (const field of Object.keys(past.op.fields)) changed.set(field, name)
  }

  const fields = Object.entries(op.fields)
  const differs = fields.filter(([f, value]) => item[f as keyof TripItem] !== value)
  const clashing = clashingFields(
    differs.map(([f]) => f),
    new Set(changed.keys()),
  )
  // A place goes whole, including the parts that happen to be the same.
  const dropped = clashingFields(
    fields.map(([f]) => f),
    new Set(clashing),
  )
  if (dropped.length === 0) return { op }

  const only = (source: object) =>
    Object.fromEntries(Object.entries(source).filter(([f]) => dropped.includes(f)))
  const conflict: Conflict = {
    itemId: op.itemId,
    userName: changed.get(dropped.find((f) => changed.has(f)) ?? '') ?? '',
    mine: only(op.fields),
    theirs: only(item),
  }
  const kept = Object.fromEntries(fields.filter(([f]) => !dropped.includes(f)))
  return { op: Object.keys(kept).length > 0 ? { ...op, fields: kept } : null, conflict }
}

/** Moves the trip to its next revision, logs what happened and tells the realtime server. */
export async function record(tx: Tx, entry: typeof activityLog.$inferInsert) {
  const { tripId, revision } = entry
  await tx.update(trips).set({ revision }).where(eq(trips.id, tripId))
  await tx.insert(activityLog).values(entry)
  await tx.execute(sql`select pg_notify('trip', ${JSON.stringify({ tripId, revision })})`)
}

/**
 * The only way a trip changes, apart from its members (members.ts). Locks the trip row, so its operations run one at a time and
 * revisions have no gaps, and records each one once however often it is sent.
 */
export async function applyOperation(
  db: AnyDb,
  request: { userId: string; tripId: string; opId: string; op: Operation; queued?: boolean },
): Promise<OperationResult> {
  const { userId, tripId, opId, queued } = request
  return db.transaction(async (tx) => {
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update')
    const [member] = await tx
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    if (!trip || !member || member.role === 'viewer') throw new OperationError('forbidden')

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
    if (done) return (done.payload as { result: OperationResult }).result

    const { op, conflict } =
      queued && request.op.type === 'item.update'
        ? await settleQueued(tx, userId, trip.id, request.op)
        : { op: request.op, conflict: undefined }
    // Nothing of it is left: no change, so no revision, and a retry finds the same.
    if (!op) return { revision: trip.revision, conflict }

    const item = await run(tx, userId, trip, op)
    const revision = trip.revision + 1
    const result: OperationResult = {
      revision,
      ...(item && { item }),
      ...(conflict && { conflict }),
    }
    const itemId = 'itemId' in op ? op.itemId : null
    await record(tx, {
      tripId,
      revision,
      opId,
      userId,
      action: op.type,
      itemId,
      payload: { op, result },
    })
    return result
  })
}
