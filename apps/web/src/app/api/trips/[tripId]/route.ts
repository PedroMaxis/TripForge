import { tripForRequest } from '@/lib/api'

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { trip, denied } = await tripForRequest(params)
  if (!trip) return denied
  return Response.json(trip, { headers: { 'cache-control': 'no-store' } })
}
