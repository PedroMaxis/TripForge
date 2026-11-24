import { jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'

const audience = 'tripforge-realtime'
const defaultTtlSeconds = 5 * 60

const claims = z.object({
  sub: z.string().min(1),
  exp: z.number(),
  name: z.string(),
  image: z.string().nullable(),
})

export type RealtimeUser = { userId: string; name: string; image: string | null }

function key(secret: string) {
  if (secret.length < 32) throw new Error('The realtime secret must have at least 32 characters')
  return new TextEncoder().encode(secret)
}

export async function signRealtimeToken(
  user: RealtimeUser,
  { secret, ttlSeconds = defaultTtlSeconds }: { secret: string; ttlSeconds?: number },
) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ name: user.name, image: user.image })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key(secret))
}

export async function verifyRealtimeToken(
  token: string,
  { secret }: { secret: string },
): Promise<RealtimeUser & { expiresAt: number }> {
  const { payload } = await jwtVerify(token, key(secret), { audience, algorithms: ['HS256'] })
  const { sub, exp, name, image } = claims.parse(payload)
  return { userId: sub, name, image, expiresAt: exp * 1000 }
}
