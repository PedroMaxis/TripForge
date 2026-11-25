import {
  byPosition,
  datesBetween,
  daysApart,
  type NewTrip,
  newTripSchema,
  shiftDate,
  type Trip,
  type TripItem,
  type TripSummary,
} from '@tripforge/core'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { AnyDb } from './client'
import { days, items, tripMembers, trips, users } from './schema'

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export const isUuid = (text: string) => uuid.test(text)

/** Postgres gives times back with seconds. */
const toTime = (time: string | null) => time?.slice(0, 5) ?? null

export function toTripItem(row: typeof items.$inferSelect): TripItem {
  const { id, dayId, position, kind, title, placeName, address, lat, lng, osmRef, notes, done } =
    row
  const { version, updatedBy } = row
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
    lat,
    lng,
    osmRef,
    notes,
    done,
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

/** A new trip of one's own with the same days and stops, or null when it is not theirs to see. */
export async function duplicateTrip(
  db: AnyDb,
  userId: string,
  tripId: string,
  { title, startDate }: Pick<NewTrip, 'title' | 'startDate'>,
): Promise<string | null> {
  const source = await getTrip(db, userId, tripId)
  if (!source) return null
  const { destination, destinationLat, destinationLng, timezone } = source
  return db.transaction(async (tx) => {
    const id = await createTrip(tx, userId, {
      title,
      destination,
      destinationLat,
      destinationLng,
      timezone,
      startDate,
      endDate: shiftDate(startDate, daysApart(source.startDate, source.endDate)),
    })
    const copies = await tx.select().from(days).where(eq(days.tripId, id)).orderBy(asc(days.date))
    const dayIds = new Map(source.days.map((day, i) => [day.id, copies[i]!.id]))
    for (const day of source.days) {
      if (!day.title && !day.notes) continue
      await tx
        .update(days)
        .set({ title: day.title, notes: day.notes })
        .where(eq(days.id, dayIds.get(day.id)!))
    }
    const rows = source.items.map(({ id: _, version: __, done: ___, dayId, ...item }) => ({
      ...item,
      tripId: id,
      dayId: dayId && dayIds.get(dayId)!,
      updatedBy: userId,
    }))
    if (rows.length > 0) await tx.insert(items).values(rows)
    return id
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
  const { id, title, destination, destinationLat, destinationLng, startDate, endDate, archivedAt } =
    row
  return {
    id,
    title,
    destination,
    destinationLat,
    destinationLng,
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

const readSnapshot = { isolationLevel: 'repeatable read' } as const

async function loadTrip(
  db: AnyDb,
  row: typeof trips.$inferSelect,
  role: Trip['role'],
  people: Awaited<ReturnType<typeof members>>,
): Promise<Trip> {
  const dayRows = await db
    .select()
    .from(days)
    .where(eq(days.tripId, row.id))
    .orderBy(asc(days.date))
  const itemRows = await db
    .select()
    .from(items)
    .where(and(eq(items.tripId, row.id), isNull(items.deletedAt)))
  return {
    ...toSummary(row, people),
    timezone: row.timezone,
    revision: row.revision,
    role,
    days: dayRows.map(({ id, date, title, notes }) => ({ id, date, title, notes })),
    items: itemRows.map(toTripItem).sort(byPosition),
  }
}

/** The whole trip as one person sees it, or null when it is not theirs to see. */
export async function getTrip(db: AnyDb, userId: string, tripId: string): Promise<Trip | null> {
  if (!isUuid(tripId)) return null
  // One snapshot, so the revision always matches the items.
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ trip: trips, role: tripMembers.role })
      .from(trips)
      .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
      .where(eq(trips.id, tripId))
    if (!found) return null
    return loadTrip(tx, found.trip, found.role, await members(tx, [tripId]))
  }, readSnapshot)
}

/**
 * The itinerary for someone without an account: the days and their stops, and nothing about the
 * people. Whoever calls it has checked that a link allows it.
 */
export async function getTripForGuest(db: AnyDb, tripId: string): Promise<Trip | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(trips).where(eq(trips.id, tripId))
    if (!row) return null
    const trip = await loadTrip(tx, row, 'viewer', [])
    return {
      ...trip,
      items: trip.items
        .filter((item) => item.dayId !== null)
        .map((item) => ({ ...item, updatedBy: null })),
    }
  }, readSnapshot)
}
