import { byPosition, type Trip } from '@tripforge/core'

/** The stops of a day, or the ideas without one, in order. */
export function itemsOf(trip: Trip, dayId: string | null) {
  return trip.items.filter((i) => i.dayId === dayId).sort(byPosition)
}
