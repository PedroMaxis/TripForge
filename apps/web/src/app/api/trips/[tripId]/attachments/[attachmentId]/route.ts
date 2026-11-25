import { getAttachment, isUuid } from '@tripforge/db'
import { fail } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

type Props = { params: Promise<{ tripId: string; attachmentId: string }> }

export async function GET(_: Request, { params }: Props) {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  const { tripId, attachmentId } = await params
  const file =
    isUuid(tripId) && isUuid(attachmentId)
      ? await getAttachment(db(), session.user.id, tripId, attachmentId)
      : null
  if (!file) return fail('not_found', 404)
  return new Response(Buffer.from(file.data), {
    headers: {
      'content-type': file.type,
      'content-disposition': `inline; filename="file"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      // Browsers show PDFs with a viewer of their own, which a sandbox would stop.
      ...(file.type !== 'application/pdf' && {
        'content-security-policy': "default-src 'none'; sandbox",
      }),
    },
  })
}
