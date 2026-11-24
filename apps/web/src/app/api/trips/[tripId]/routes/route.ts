import { tripLegs } from '@tripforge/core'
import { findLegs } from '@tripforge/db'
import { tripForRequest } from '@/lib/api'
import { db } from '@/lib/db'
import { router } from '@/lib/router'

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { trip, denied } = await tripForRequest(params)
  if (!trip) return denied
  // Only what the trip really contains is ever routed, so this is no open door to the service.
  const wanted = tripLegs(trip.items)
  const legs = await findLegs(
    db(),
    wanted.map((l) => l.key),
  )
  const pending = router().request(wanted.filter((l) => !legs[l.key]))
  return Response.json({ legs, pending }, { headers: { 'cache-control': 'no-store' } })
}
