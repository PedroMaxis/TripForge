import { deleteAccount } from '@tripforge/db'
import { headers } from 'next/headers'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { routing } from '@/i18n/routing'
import { fail } from '@/lib/api'
import { auth, getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { createRateLimit } from '@/lib/rate-limit'

const bodySchema = z.strictObject({ password: z.string().min(1).max(128), locale: z.string() })
const allow = createRateLimit({ max: 5, windowMs: 60_000 })

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return fail('unauthorized', 401)
  if (!allow(session.user.id)) return fail('too_many', 429)
  // JSON is not a type a form can send, so no other site can make a browser do this.
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return fail('invalid', 400)
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return fail('invalid', 400)
  const { password, locale } = body.data
  try {
    await auth().api.verifyPassword({ body: { password }, headers: await headers() })
  } catch {
    return fail('wrong_password', 403)
  }
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: 'Profile',
  })
  await deleteAccount(db(), session.user.id, t('deletedName'))
  return Response.json({ ok: true })
}
