import { distanceKm, type Point } from './geo'
import type { TripItem } from './trip'

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

/** What a clock and a calendar on the wall say in a timezone. */
export function clockIn(timezone: string, at = new Date()) {
  const [date, time] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
  })
    .format(at)
    .split(' ')
  return { date: date!, time: time! }
}

/** The end of a stop, in minutes of its day; past 24 hours when it goes through midnight. */
function endOf({ startTime, endTime }: TripItem) {
  if (!startTime) return null
  const start = minutes(startTime)
  if (!endTime) return start + 60
  const end = minutes(endTime)
  return end < start ? end + 24 * 60 : end
}

/** Where to be now, or next, among the stops of today. */
export function nextStop(day: TripItem[], time: string): TripItem | null {
  const now = minutes(time)
  const done = day.findLastIndex((i) => i.done)
  const started = day.findLastIndex((i) => i.startTime && minutes(i.startTime) <= now)
  return (
    day.find((item, index) => {
      const end = endOf(item)
      return index > done && index >= started && (end === null || end >= now)
    }) ?? null
  )
}

type Block = { items: TripItem[]; point: Point; timed: boolean }

const maxStops = 12
const minSavedKm = 0.3
const minSavedShare = 0.1

/**
 * A way through the same stops that is clearly shorter in a straight line, if there is one. The
 * day still starts where it started, and ends where everyone sleeps; stops with a time keep their
 * order among themselves.
 */
export function shorterOrder(day: TripItem[]): { ids: string[]; savedKm: number } | null {
  const before: TripItem[] = []
  const blocks: Block[] = []
  for (const item of day) {
    const block = blocks.at(-1)
    if (item.lat !== null && item.lng !== null) {
      blocks.push({ items: [item], point: { lat: item.lat, lng: item.lng }, timed: false })
    } else if (block) block.items.push(item)
    else before.push(item)
  }
  const count = blocks.length
  if (count < 3 || count > maxStops) return null
  for (const block of blocks) block.timed = block.items.some((i) => i.startTime)
  const endsFixed = blocks.at(-1)?.items[0]?.kind === 'lodging'

  const km = blocks.map((a) => blocks.map((b) => distanceKm(a.point, b.point)))
  // For each stop, the ones that must already be behind.
  const needs = blocks.map((block, i) => {
    let mask = i === 0 ? 0 : 1
    for (let j = 0; j < i; j++) if (block.timed && blocks[j]!.timed) mask |= 1 << j
    if (endsFixed && i === count - 1) mask = (1 << i) - 1
    return mask
  })

  // Held-Karp: the shortest way to have seen a set of stops and be at one of them.
  const all = (1 << count) - 1
  const cost = Array.from({ length: all + 1 }, () => new Float64Array(count).fill(Infinity))
  const from = Array.from({ length: all + 1 }, () => new Int8Array(count).fill(-1))
  cost[1]![0] = 0
  for (let seen = 1; seen <= all; seen++) {
    for (let last = 0; last < count; last++) {
      const spent = cost[seen]![last]!
      if (spent === Infinity) continue
      for (let next = 1; next < count; next++) {
        if (seen & (1 << next) || (needs[next]! & seen) !== needs[next]) continue
        const then = seen | (1 << next)
        const total = spent + km[last]![next]!
        if (total < cost[then]![next]!) {
          cost[then]![next] = total
          from[then]![next] = last
        }
      }
    }
  }
  let last = cost[all]!.indexOf(Math.min(...cost[all]!))
  const current = blocks.slice(1).reduce((sum, _, i) => sum + km[i]![i + 1]!, 0)
  const savedKm = current - cost[all]![last]!
  if (savedKm < minSavedKm || savedKm < current * minSavedShare) return null

  const order: number[] = []
  for (let seen = all; last >= 0; ) {
    order.unshift(last)
    const previous = from[seen]![last]!
    seen &= ~(1 << last)
    last = previous
  }
  const ids = [...before, ...order.flatMap((i) => blocks[i]!.items)].map((i) => i.id)
  return { ids, savedKm }
}
