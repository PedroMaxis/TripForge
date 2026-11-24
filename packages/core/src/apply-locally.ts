import type { Operation } from './operations'
import { byPosition } from './position'
import type { Trip, TripItem } from './trip'

export function withItem(trip: Trip, item: TripItem): Trip {
  return { ...trip, items: [...trip.items.filter((i) => i.id !== item.id), item].sort(byPosition) }
}

const defined = <T extends object>(fields: T) =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>
  }

/**
 * What an operation will look like once the server accepts it. Anything that only the server
 * knows, such as the days after a date change or a restored item, arrives with its answer.
 */
export function applyLocally(trip: Trip, op: Operation): Trip {
  switch (op.type) {
    case 'trip.update': {
      const { archived: _, ...fields } = op.fields
      return { ...trip, ...defined(fields) }
    }
    case 'day.update':
      return {
        ...trip,
        days: trip.days.map((d) => (d.id === op.dayId ? { ...d, ...defined(op.fields) } : d)),
      }
    case 'item.create':
      return withItem(trip, {
        id: op.itemId,
        dayId: op.dayId,
        position: op.position,
        kind: op.kind,
        title: op.title,
        startTime: null,
        endTime: null,
        placeName: null,
        address: null,
        lat: null,
        lng: null,
        osmRef: null,
        notes: null,
        ...op.place,
        version: 1,
        updatedBy: null,
      })
    case 'item.delete':
      return { ...trip, items: trip.items.filter((i) => i.id !== op.itemId) }
    case 'item.restore':
      return trip
    case 'item.update':
    case 'item.move': {
      const item = trip.items.find((i) => i.id === op.itemId)
      if (!item) return trip
      const next: TripItem =
        op.type === 'item.move'
          ? { ...item, dayId: op.dayId, position: op.position }
          : { ...item, ...defined(op.fields) }
      return withItem(trip, next.startTime === null ? { ...next, endTime: null } : next)
    }
  }
}
