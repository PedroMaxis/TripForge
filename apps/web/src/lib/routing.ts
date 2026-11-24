import { isWalkable, type Leg, type Point, routeMode, type TravelMode } from '@tripforge/core'
import { z } from 'zod'

export type LegRequest = { key: string; from: Point; to: Point }

const answerSchema = z.object({
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])).min(2) }),
      }),
    )
    .min(1),
})

const timeoutMs = 10_000
const maxQueue = 500

/**
 * Asks an OSRM server for street routes, one at a time and no faster than its owners allow.
 * Nothing waits for it: callers queue what they miss and read the saved legs later.
 */
export function createRouter({
  url,
  save,
  intervalMs = 1100,
  retryMs = 60_000,
}: {
  url: string | undefined
  save: (key: string, leg: Leg) => Promise<void>
  intervalMs?: number
  retryMs?: number
}) {
  const queue = new Map<string, LegRequest>()
  const failed = new Map<string, number>()
  let working: Promise<void> | undefined
  let lastRequest = 0

  async function ask(mode: TravelMode, { from, to }: LegRequest): Promise<Leg> {
    const wait = lastRequest + intervalMs - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequest = Date.now()
    const points = `${from.lng},${from.lat};${to.lng},${to.lat}`
    const res = await fetch(
      `${url}/routed-${mode}/route/v1/driving/${points}?overview=full&geometries=geojson`,
      { headers: { 'user-agent': 'TripForge' }, signal: AbortSignal.timeout(timeoutMs) },
    )
    if (!res.ok) throw new Error(`Routing answered ${res.status}`)
    const route = answerSchema.parse(await res.json()).routes[0]!
    return {
      mode,
      meters: Math.round(route.distance),
      seconds: Math.round(route.duration),
      line: route.geometry.coordinates,
    }
  }

  async function find(request: LegRequest) {
    if (isWalkable(request.from, request.to)) {
      const walk = await ask('foot', request)
      if (routeMode(walk.meters) === 'foot') return walk
    }
    return ask('car', request)
  }

  async function work() {
    for (let next = queue.values().next().value; next; next = queue.values().next().value) {
      try {
        await save(next.key, await find(next))
        failed.delete(next.key)
      } catch {
        failed.set(next.key, Date.now())
      }
      queue.delete(next.key)
    }
    working = undefined
  }

  return {
    /** Queues the legs and says how many of them are still to come. */
    request(legs: LegRequest[]) {
      if (!url) return 0
      let pending = 0
      for (const leg of legs) {
        const failedAt = failed.get(leg.key)
        if (failedAt !== undefined && Date.now() - failedAt < retryMs) continue
        if (!queue.has(leg.key)) {
          if (queue.size >= maxQueue) continue
          queue.set(leg.key, leg)
        }
        pending++
      }
      if (pending > 0) working ??= work()
      return pending
    },
    idle: async () => working,
  }
}
