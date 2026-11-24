import type { ItemKind } from './domain'
import { byPosition } from './position'
import type { TripItem } from './trip'

export type Point = { lat: number; lng: number }
export type TravelMode = 'foot' | 'car'
export type Leg = { mode: TravelMode; meters: number; seconds: number; line: [number, number][] }
export type Place = {
  name: string
  address: string
  lat: number
  lng: number
  osmRef: string
  kind: ItemKind
}

const maxRouteKm = 500
const maxWalkMeters = 2000

/** Five decimals is about a meter, and keeps the same place under the same key. */
export const roundCoordinate = (value: number) => Math.round(value * 1e5) / 1e5

export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

const pair = (p: Point) => `${roundCoordinate(p.lng)},${roundCoordinate(p.lat)}`
export const legKey = (from: Point, to: Point) => `${pair(from)};${pair(to)}`

export const routeMode = (walkMeters: number): TravelMode =>
  walkMeters <= maxWalkMeters ? 'foot' : 'car'

/** Straight distances over this are never walked, so there is no need to ask. */
export const isWalkable = (from: Point, to: Point) => distanceKm(from, to) * 1000 <= maxWalkMeters

export type PlacedStop = TripItem & Point & { number: number }

/** The stops of one day that are on the map, numbered as they are in the whole day. */
export function stopsWithPlace(day: TripItem[]): PlacedStop[] {
  return day.flatMap((item, index) =>
    item.lat !== null && item.lng !== null
      ? [{ ...item, lat: item.lat, lng: item.lng, number: index + 1 }]
      : [],
  )
}

export function dayLegs(day: TripItem[]) {
  const stops = stopsWithPlace(day)
  return stops.slice(1).flatMap((to, i) => {
    const from = stops[i]
    if (!from || pair(from) === pair(to) || distanceKm(from, to) > maxRouteKm) return []
    return [{ from, to, key: legKey(from, to) }]
  })
}

export function tripLegs(items: TripItem[]) {
  const days = new Map<string, TripItem[]>()
  for (const item of [...items].sort(byPosition)) {
    if (item.dayId) days.set(item.dayId, [...(days.get(item.dayId) ?? []), item])
  }
  return [...days.values()].flatMap(dayLegs)
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

/** Why someone cannot be at the next stop on time, if they cannot. */
export function lateFor(
  stop: Pick<TripItem, 'endTime'>,
  next: Pick<TripItem, 'startTime'>,
  travelSeconds: number | null,
): 'overlap' | 'travel' | null {
  if (!stop.endTime || !next.startTime) return null
  const free = minutes(next.startTime) - minutes(stop.endTime)
  if (free < 0) return 'overlap'
  return travelSeconds !== null && travelSeconds / 60 > free ? 'travel' : null
}
