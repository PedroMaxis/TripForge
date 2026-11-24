import tzlookup from '@photostructure/tz-lookup'
import { z } from 'zod'
import { fail } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { searchPlaces } from '@/lib/places'
import { createRateLimit } from '@/lib/rate-limit'

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
  locale: z.string().max(10).default('en'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

const allow = createRateLimit({ max: 40, windowMs: 10_000 })

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  if (!allow(session.user.id)) return fail('too_many', 429)
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return fail('invalid', 400)
  const { q, locale, lat, lng } = query.data
  try {
    const near = lat !== undefined && lng !== undefined ? { lat, lng } : null
    const places = await searchPlaces(q, near, locale)
    return Response.json({
      places: places.map((place) => ({ ...place, timezone: tzlookup(place.lat, place.lng) })),
    })
  } catch {
    return fail('unavailable', 502)
  }
}
