import { getLog } from '@tripforge/db'
import { z } from 'zod'
import { fail } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const sinceSchema = z.coerce.number().int().min(0)

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  const since = sinceSchema.safeParse(new URL(request.url).searchParams.get('since') ?? undefined)
  if (!since.success) return fail('invalid', 400)
  const log = await getLog(db(), session.user.id, (await params).tripId, since.data)
  if (!log) return fail('not_found', 404)
  return Response.json(log, { headers: { 'cache-control': 'no-store' } })
}
