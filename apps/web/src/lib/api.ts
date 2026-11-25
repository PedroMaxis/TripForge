import { type Trip, tripLegs } from '@tripforge/core'
import { findLegs, getSharedTrip, getTrip, reliefs } from '@tripforge/db'
import { eq } from 'drizzle-orm'
import { getSession } from './auth'
import { db } from './db'
import { env } from './env'
import { createRateLimit } from './rate-limit'
import { drawRelief } from './relief'
import { router } from './router'

export const fail = (error: string, status: number) => Response.json({ error }, { status })
export const fresh = { 'cache-control': 'no-store' }

type Allowed = { trip: Trip; denied?: undefined } | { trip?: undefined; denied: Response }

/** The trip, if whoever is asking may see it; otherwise the answer to give. */
export async function tripForRequest(params: Promise<{ tripId: string }>): Promise<Allowed> {
  const session = await getSession()
  if (!session) return { denied: fail('unauthorized', 401) }
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  return trip ? { trip } : { denied: fail('not_found', 404) }
}

// A page asks a few times a minute; a whole family with one link still fits.
const allowGuest = createRateLimit({ max: 300, windowMs: 60_000 })

/** The same, for someone with a view link instead of an account. */
export async function sharedTripForRequest(params: Promise<{ token: string }>): Promise<Allowed> {
  const { token } = await params
  if (!allowGuest(token)) return { denied: fail('too_many', 429) }
  const shared = await getSharedTrip(db(), token)
  if (shared.status === 'ok') return { trip: shared.trip }
  return { denied: fail(shared.status, shared.status === 'unknown' ? 404 : 410) }
}

/** The street routes of a trip that are known, and how many are still being found. */
export async function routesResponse(trip: Trip) {
  // Only what the trip really contains is ever routed, so this is no open door to the service.
  const wanted = tripLegs(trip.items)
  const legs = await findLegs(
    db(),
    wanted.map((l) => l.key),
  )
  const pending = router().request(wanted.filter((l) => !legs[l.key]))
  return Response.json({ legs, pending }, { headers: fresh })
}

/** The contour lines of a trip's destination. */
export async function reliefResponse({ destinationLat: lat, destinationLng: lng }: Trip) {
  if (lat === null || lng === null) return fail('not_found', 404)
  // Two decimals, about a kilometer: the same city shares one drawing.
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const [saved] = await db().select().from(reliefs).where(eq(reliefs.key, key))
  let svg = saved?.svg
  if (!svg) {
    try {
      const center = { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) }
      svg = await drawRelief(center, env().TERRAIN_URL)
    } catch {
      return fail('unavailable', 502)
    }
    await db().insert(reliefs).values({ key, svg }).onConflictDoNothing()
  }
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'private, max-age=86400',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  })
}
