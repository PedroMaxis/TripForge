import { fresh, sharedTripForRequest } from '@/lib/api'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { trip, denied } = await sharedTripForRequest(params)
  if (!trip) return denied
  // Asked every few seconds, and nearly always for nothing new.
  const since = new URL(request.url).searchParams.get('since')
  if (since === String(trip.revision)) return new Response(null, { status: 204, headers: fresh })
  return Response.json(trip, { headers: fresh })
}
