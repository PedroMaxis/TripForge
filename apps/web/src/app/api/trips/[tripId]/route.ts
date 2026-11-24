import { getTrip } from '@tripforge/db'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  if (!trip) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json(trip, { headers: { 'cache-control': 'no-store' } })
}
