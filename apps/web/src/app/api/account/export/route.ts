import { exportAccount } from '@tripforge/db'
import { fail, fresh } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  return new Response(JSON.stringify(await exportAccount(db(), session.user.id), null, 2), {
    headers: {
      ...fresh,
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="tripforge.json"',
    },
  })
}
