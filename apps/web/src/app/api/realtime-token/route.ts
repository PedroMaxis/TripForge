import { signRealtimeToken } from '@tripforge/core'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/env'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { id, name, image } = session.user
  const token = await signRealtimeToken(
    { userId: id, name, image: image ?? null },
    { secret: env().REALTIME_SECRET },
  )
  return Response.json({ token }, { headers: { 'cache-control': 'no-store' } })
}
