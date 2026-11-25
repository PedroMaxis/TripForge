import { z } from 'zod'
import { daysApart, isDate } from './dates'
import type { ItemKind, Role } from './domain'
import type { TripGroup } from './group'

export const maxTripDays = 90

function isTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const latitude = z.number().min(-90).max(90).nullable()
const longitude = z.number().min(-180).max(180).nullable()
export const coordinates = { lat: latitude, lng: longitude }

/** Coordinates are set or cleared together. */
export const arePaired = (a?: number | null, b?: number | null) =>
  (a === undefined) === (b === undefined) && (a === null) === (b === null)

export const tripFields = {
  title: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(200),
  startDate: z.string().refine(isDate),
  endDate: z.string().refine(isDate),
  timezone: z.string().max(64).refine(isTimezone),
}
export const tripPlaceFields = { destinationLat: latitude, destinationLng: longitude }

export function areTripDates({ startDate, endDate }: { startDate: string; endDate: string }) {
  const length = daysApart(startDate, endDate) + 1
  return length >= 1 && length <= maxTripDays
}

export const newTripSchema = z
  .object({ ...tripFields, ...z.object(tripPlaceFields).partial().shape })
  .refine(areTripDates, { path: ['endDate'] })
  .refine((t) => arePaired(t.destinationLat, t.destinationLng), { path: ['destination'] })
export type NewTrip = z.infer<typeof newTripSchema>

export type TripDay = { id: string; date: string; title: string | null; notes: string | null }

export type TripItem = {
  id: string
  /** Null means the item is in the Ideas list. */
  dayId: string | null
  position: string
  kind: ItemKind
  title: string
  startTime: string | null
  endTime: string | null
  placeName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  osmRef: string | null
  notes: string | null
  /** Already been there. */
  done: boolean
  version: number
  updatedBy: string | null
}

export type TripMember = { userId: string; name: string; image: string | null; role: Role }

export type TripSummary = {
  id: string
  title: string
  destination: string
  destinationLat: number | null
  destinationLng: number | null
  startDate: string
  endDate: string
  archivedAt: string | null
  members: TripMember[]
}

export type Trip = TripSummary & {
  timezone: string
  revision: number
  role: Role
  days: TripDay[]
  items: TripItem[]
  /** Null for who only looks. */
  group: TripGroup | null
}
