import { tripForRequest, weatherResponse } from '@/lib/api'

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { trip, denied } = await tripForRequest(params)
  return trip ? weatherResponse(trip) : denied
}
