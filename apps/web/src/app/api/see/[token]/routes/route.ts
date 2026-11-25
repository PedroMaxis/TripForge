import { routesResponse, sharedTripForRequest } from '@/lib/api'

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { trip, denied } = await sharedTripForRequest(params)
  return trip ? routesResponse(trip) : denied
}
