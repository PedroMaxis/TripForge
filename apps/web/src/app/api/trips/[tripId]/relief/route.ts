import { reliefs } from '@tripforge/db'
import { eq } from 'drizzle-orm'
import { fail, tripForRequest } from '@/lib/api'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { drawRelief } from '@/lib/relief'

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { trip, denied } = await tripForRequest(params)
  if (!trip) return denied
  const { destinationLat: lat, destinationLng: lng } = trip
  if (lat === null || lng === null) return fail('not_found', 404)

  // Two decimals, about a kilometer: the same city shares one drawing.
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const [saved] = await db().select().from(reliefs).where(eq(reliefs.key, key))
  let svg = saved?.svg
  if (!svg) {
    try {
      svg = await drawRelief(
        { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) },
        env().TERRAIN_URL,
      )
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
