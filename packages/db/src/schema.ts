import { defaultLocale, itemKinds, locales, operationTypes, roles } from '@tripforge/core'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const localeEnum = pgEnum('locale', locales)
export const roleEnum = pgEnum('role', roles)
export const itemKindEnum = pgEnum('item_kind', itemKinds)
export const operationTypeEnum = pgEnum('operation_type', operationTypes)

/** Fractional-index key. The "C" collation makes Postgres sort it exactly like JavaScript does. */
const positionKey = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' })

const timestamptz = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => timestamptz('created_at').notNull().defaultNow()
const updatedAt = () =>
  timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// --- Better Auth -----------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  locale: localeEnum('locale').notNull().default(defaultLocale),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    refreshTokenExpiresAt: timestamptz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    unique('accounts_provider_account_key').on(t.providerId, t.accountId),
  ],
)

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
)

// --- TripForge -------------------------------------------------------------

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    destination: text('destination').notNull(),
    destinationLat: doublePrecision('destination_lat'),
    destinationLng: doublePrecision('destination_lng'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    timezone: text('timezone').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    revision: integer('revision').notNull().default(0),
    archivedAt: timestamptz('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('trips_dates_check', sql`${t.endDate} >= ${t.startDate}`),
    check(
      'trips_destination_coords_check',
      sql`(${t.destinationLat} is null) = (${t.destinationLng} is null)
        and ${t.destinationLat} between -90 and 90
        and ${t.destinationLng} between -180 and 180`,
    ),
  ],
)

export const tripMembers = pgTable(
  'trip_members',
  {
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    joinedAt: timestamptz('joined_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.userId] }),
    index('trip_members_user_id_idx').on(t.userId),
  ],
)

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    role: roleEnum('role').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('invites_trip_id_idx').on(t.tripId),
    check('invites_role_check', sql`${t.role} <> 'owner'`),
  ],
)

export const days = pgTable(
  'days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    title: text('title'),
    notes: text('notes'),
  },
  (t) => [
    unique('days_trip_date_key').on(t.tripId, t.date),
    // Target of the composite foreign key that keeps an item on a day of its own trip.
    unique('days_trip_id_key').on(t.tripId, t.id),
  ],
)

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    /** Null means the item is in the Ideas list. */
    dayId: uuid('day_id'),
    position: positionKey('position').notNull(),
    kind: itemKindEnum('kind').notNull(),
    title: text('title').notNull(),
    /** Local wall-clock times, read in the trip timezone. */
    startTime: time('start_time'),
    endTime: time('end_time'),
    placeName: text('place_name'),
    address: text('address'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    osmRef: text('osm_ref'),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    foreignKey({
      name: 'items_day_fk',
      columns: [t.tripId, t.dayId],
      foreignColumns: [days.tripId, days.id],
    }),
    index('items_trip_day_position_idx').on(t.tripId, t.dayId, t.position),
    check(
      'items_coords_check',
      sql`(${t.lat} is null) = (${t.lng} is null)
        and ${t.lat} between -90 and 90
        and ${t.lng} between -180 and 180`,
    ),
  ],
)

export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    opId: uuid('op_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    action: operationTypeEnum('action').notNull(),
    itemId: uuid('item_id'),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('activity_log_trip_revision_key').on(t.tripId, t.revision),
    uniqueIndex('activity_log_op_key').on(t.tripId, t.userId, t.opId),
    index('activity_log_item_revision_idx').on(t.itemId, t.revision),
  ],
)
