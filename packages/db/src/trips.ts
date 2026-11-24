import {
  byPosition,
  datesBetween,
  type NewTrip,
  newTripSchema,
  type Trip,
  type TripItem,
  type TripSummary,
} from '@tripforge/core'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { AnyDb } from './client'
import { days, items, tripMembers, trips, users } from './schema'

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

/** Postgres gives times back with seconds. */
const toTime = (time: string | null) => time?.slice(0, 5) ?? null

export function toTripItem(row: typeof items.$inferSelect): TripItem {
  const { id, dayId, position, kind, title, placeName, address, notes, version, updatedBy } = row
  return {
    id,
    dayId,
    position,
    kind,
    title,
    startTime: toTime(row.startTime),
    endTime: toTime(row.endTime),
    placeName,
    address,
    notes,
    version,
    updatedBy,
  }
}

export async function createTrip(db: AnyDb, userId: string, input: NewTrip) {
  const values = newTripSchema.parse(input)
  return db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({ ...values, ownerId: userId })
      .returning({ id: trips.id })
    const tripId = trip!.id
    await tx.insert(tripMembers).values({ tripId, userId, role: 'owner' })
    await tx
      .insert(days)
      .values(datesBetween(values.startDate, values.endDate).map((date) => ({ tripId, date })))
    return tripId
  })
}

const members = (db: AnyDb, tripIds: string[]) =>
  db
    .select({
      tripId: tripMembers.tripId,
      userId: tripMembers.userId,
      name: users.name,
      image: users.image,
      role: tripMembers.role,
    })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(inArray(tripMembers.tripId, tripIds))
    .orderBy(asc(tripMembers.joinedAt), asc(tripMembers.userId))

function toSummary(
  row: typeof trips.$inferSelect,
  people: Awaited<ReturnType<typeof members>>,
): TripSummary {
  const { id, title, destination, startDate, endDate, archivedAt } = row
  return {
    id,
    title,
    destination,
    startDate,
    endDate,
    archivedAt: archivedAt?.toISOString() ?? null,
    members: people.filter((p) => p.tripId === id).map(({ tripId: _, ...person }) => person),
  }
}

export async function listTrips(db: AnyDb, userId: string): Promise<TripSummary[]> {
  const rows = await db
    .select({ trip: trips })
    .from(trips)
    .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
    .orderBy(asc(trips.startDate), asc(trips.id))
  if (rows.length === 0) return []
  const people = await members(
    db,
    rows.map((r) => r.trip.id),
  )
  return rows.map((r) => toSummary(r.trip, people))
}

/** The whole trip as one person sees it, or null when it is not theirs to see. */
export async function getTrip(db: AnyDb, userId: string, tripId: string): Promise<Trip | null> {
  if (!uuid.test(tripId)) return null
  // One snapshot, so the revision always matches the items.
  return db.transaction(
    async (tx) => {
      const [found] = await tx
        .select({ trip: trips, role: tripMembers.role })
        .from(trips)
        .innerJoin(
          tripMembers,
          and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)),
        )
        .where(eq(trips.id, tripId))
      if (!found) return null
      const people = await members(tx, [tripId])
      const dayRows = await tx
        .select()
        .from(days)
        .where(eq(days.tripId, tripId))
        .orderBy(asc(days.date))
      const itemRows = await tx
        .select()
        .from(items)
        .where(and(eq(items.tripId, tripId), isNull(items.deletedAt)))
      return {
        ...toSummary(found.trip, people),
        timezone: found.trip.timezone,
        revision: found.trip.revision,
        role: found.role,
        days: dayRows.map(({ id, date, title, notes }) => ({ id, date, title, notes })),
        items: itemRows.map(toTripItem).sort(byPosition),
      }
    },
    { isolationLevel: 'repeatable read' },
  )
}
