import { asc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { activityLog, days, items, tripMembers, trips, users } from './index'
import { createTestDb, type TestDb } from './testing'

let t: TestDb
let tripId: string
let otherTripId: string

beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())

async function newTrip(title: string) {
  const [trip] = await t.db
    .insert(trips)
    .values({
      title,
      destination: 'Lisboa',
      startDate: '2027-03-01',
      endDate: '2027-03-03',
      timezone: 'Europe/Lisbon',
      ownerId: 'u1',
    })
    .returning()
  return trip!
}

beforeEach(async () => {
  await t.reset()
  await t.db.insert(users).values({ id: 'u1', name: 'Pedro', email: 'pedro@example.com' })
  tripId = (await newTrip('A')).id
  otherTripId = (await newTrip('B')).id
})

const item = (over: Partial<typeof items.$inferInsert> = {}) => ({
  tripId,
  position: 'a0',
  kind: 'activity' as const,
  title: 'Museu',
  ...over,
})

describe('users', () => {
  test('default to English', async () => {
    const [u] = await t.db.select().from(users)
    expect(u?.locale).toBe('en')
  })

  test('reject unsupported locales', async () => {
    await expect(
      t.db
        .insert(users)
        .values({ id: 'u2', name: 'X', email: 'x@example.com', locale: 'fr' as never }),
    ).rejects.toMatchObject({ cause: { code: '22P02' } })
  })
})

describe('trips', () => {
  test('start at revision 0', async () => {
    const [trip] = await t.db.select().from(trips).where(eq(trips.id, tripId))
    expect(trip?.revision).toBe(0)
  })

  test('cannot end before they start', async () => {
    await expect(
      t.db.update(trips).set({ endDate: '2027-02-01' }).where(eq(trips.id, tripId)),
    ).rejects.toMatchObject({ cause: { constraint: 'trips_dates_check' } })
  })

  test('need both destination coordinates or neither', async () => {
    await expect(
      t.db.update(trips).set({ destinationLat: 38.7 }).where(eq(trips.id, tripId)),
    ).rejects.toMatchObject({ cause: { constraint: 'trips_destination_coords_check' } })
  })

  test('take their members with them when deleted', async () => {
    await t.db.insert(tripMembers).values({ tripId, userId: 'u1', role: 'owner' })
    await t.db.delete(trips).where(eq(trips.id, tripId))
    expect(await t.db.select().from(tripMembers)).toEqual([])
  })
})

describe('days', () => {
  test('are unique per trip and date', async () => {
    await t.db.insert(days).values({ tripId, date: '2027-03-01' })
    await t.db.insert(days).values({ tripId: otherTripId, date: '2027-03-01' })
    await expect(t.db.insert(days).values({ tripId, date: '2027-03-01' })).rejects.toMatchObject({
      cause: { constraint: 'days_trip_date_key' },
    })
  })
})

describe('items', () => {
  test('sort by position byte by byte, as JavaScript does', async () => {
    const positions = ['a0', 'Zz', 'a0V', 'a1', 'a0l', 'b00']
    for (const position of positions) await t.db.insert(items).values(item({ position }))
    const rows = await t.db.select().from(items).orderBy(asc(items.position), asc(items.id))
    expect(rows.map((r) => r.position)).toEqual([...positions].sort())
  })

  test('pin the position collation, since the server default may differ', async () => {
    const { rows } = await t.db.execute(
      sql`select collation_name from information_schema.columns where table_name = 'items' and column_name = 'position'`,
    )
    expect(rows).toEqual([{ collation_name: 'C' }])
  })

  test('go away with their trip, along with its days', async () => {
    const [day] = await t.db.insert(days).values({ tripId, date: '2027-03-01' }).returning()
    await t.db.insert(items).values(item({ dayId: day!.id }))
    await t.db.delete(trips).where(eq(trips.id, tripId))
    expect(await t.db.select().from(items)).toEqual([])
  })

  test('cannot sit on a day of another trip', async () => {
    const [day] = await t.db
      .insert(days)
      .values({ tripId: otherTripId, date: '2027-03-01' })
      .returning()
    await expect(t.db.insert(items).values(item({ dayId: day!.id }))).rejects.toMatchObject({
      cause: { constraint: 'items_day_fk' },
    })
  })

  test('block deleting a day that still holds them', async () => {
    const [day] = await t.db.insert(days).values({ tripId, date: '2027-03-01' }).returning()
    await t.db.insert(items).values(item({ dayId: day!.id }))
    await expect(t.db.delete(days).where(eq(days.id, day!.id))).rejects.toMatchObject({
      cause: { constraint: 'items_day_fk' },
    })
  })

  test('reject coordinates outside the globe', async () => {
    await expect(t.db.insert(items).values(item({ lat: 91, lng: 0 }))).rejects.toMatchObject({
      cause: { constraint: 'items_coords_check' },
    })
  })

  test('start at version 1, in Ideas', async () => {
    const [row] = await t.db.insert(items).values(item()).returning()
    expect(row).toMatchObject({ version: 1, dayId: null, deletedAt: null })
  })
})

describe('activity log', () => {
  const entry = (over: Partial<typeof activityLog.$inferInsert> = {}) => ({
    tripId,
    revision: 1,
    opId: '00000000-0000-4000-8000-000000000001',
    userId: 'u1',
    action: 'trip.update' as const,
    payload: {},
    ...over,
  })

  test('records a retried operation only once', async () => {
    await t.db.insert(activityLog).values(entry())
    await expect(t.db.insert(activityLog).values(entry({ revision: 2 }))).rejects.toMatchObject({
      cause: { constraint: 'activity_log_op_key' },
    })
  })

  test('holds one operation per revision', async () => {
    await t.db.insert(activityLog).values(entry())
    await expect(
      t.db.insert(activityLog).values(entry({ opId: '00000000-0000-4000-8000-000000000002' })),
    ).rejects.toMatchObject({ cause: { constraint: 'activity_log_trip_revision_key' } })
  })
})
