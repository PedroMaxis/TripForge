import { getTrip } from '@tripforge/db'
import { getSession } from './auth'
import { db } from './db'

export const fail = (error: string, status: number) => Response.json({ error }, { status })

/** The trip, if whoever is asking may see it; otherwise the answer to give. */
export async function tripForRequest(params: Promise<{ tripId: string }>) {
  const session = await getSession()
  if (!session) return { denied: fail('unauthorized', 401) }
  const trip = await getTrip(db(), session.user.id, (await params).tripId)
  return trip ? { trip } : { denied: fail('not_found', 404) }
}
