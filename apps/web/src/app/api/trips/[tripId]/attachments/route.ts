import { AttachmentError, addAttachment, attachmentLimits, OperationError } from '@tripforge/db'
import { z } from 'zod'
import { fail, operationStatus } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const querySchema = z.object({
  item: z.uuid(),
  op: z.uuid(),
  name: z
    .string()
    // Control characters have no place in a name, and could confuse whoever shows it.
    .transform((name) => name.replace(/\p{C}/gu, '').trim().slice(-120) || 'file'),
})
const statuses = { bad_type: 415, too_large: 413, full: 409 }

/** The body, or null as soon as it proves too large. */
async function readBody(request: Request) {
  if (Number(request.headers.get('content-length')) > attachmentLimits.file) return null
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body?.getReader()
  for (;;) {
    const next = await reader?.read()
    if (!next || next.done) break
    size += next.value.length
    if (size > attachmentLimits.file) {
      await reader?.cancel()
      return null
    }
    chunks.push(next.value)
  }
  return Buffer.concat(chunks)
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  const tripId = z.uuid().safeParse((await params).tripId)
  if (!tripId.success) return fail('forbidden', 403)
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return fail('invalid', 400)
  if (request.headers.get('content-type') !== 'application/octet-stream') {
    return fail('bad_type', 415)
  }
  const data = await readBody(request)
  if (!data) return fail('too_large', 413)
  const { item, op, name } = query.data
  try {
    const added = await addAttachment(db(), {
      userId: session.user.id,
      tripId: tripId.data,
      itemId: item,
      opId: op,
      name,
      data,
    })
    return Response.json(added, { status: 201 })
  } catch (error) {
    if (error instanceof AttachmentError) return fail(error.code, statuses[error.code])
    if (error instanceof OperationError) return fail(error.code, operationStatus[error.code])
    throw error
  }
}
