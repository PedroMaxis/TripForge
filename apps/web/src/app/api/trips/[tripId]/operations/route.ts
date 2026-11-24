import { type OperationErrorCode, operationRequestSchema } from '@tripforge/core'
import { applyOperation, OperationError } from '@tripforge/db'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const statuses: Record<OperationErrorCode, number> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  deleted: 410,
}

const fail = (error: string, status: number) => Response.json({ error }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  const tripId = z.uuid().safeParse((await params).tripId)
  if (!tripId.success) return fail('forbidden', 403)
  const body = operationRequestSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return fail('invalid', 400)
  try {
    const result = await applyOperation(db(), {
      userId: session.user.id,
      tripId: tripId.data,
      ...body.data,
    })
    return Response.json(result)
  } catch (error) {
    if (error instanceof OperationError) return fail(error.code, statuses[error.code])
    throw error
  }
}
