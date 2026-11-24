import { SignJWT } from 'jose'
import { expect, test } from 'vitest'
import { signRealtimeToken, verifyRealtimeToken } from './index'

const secret = 'a'.repeat(32)
const user = { userId: 'u1', name: 'Ana', image: null }

test('a signed token gives back the user it was issued for', async () => {
  const token = await signRealtimeToken(user, { secret })
  expect(await verifyRealtimeToken(token, { secret })).toMatchObject(user)
})

test('reports the expiry so the server can close stale sockets', async () => {
  const before = Date.now()
  const token = await signRealtimeToken(user, { secret, ttlSeconds: 60 })
  const { expiresAt } = await verifyRealtimeToken(token, { secret })
  expect(expiresAt).toBeGreaterThanOrEqual(before + 59_000)
  expect(expiresAt).toBeLessThanOrEqual(Date.now() + 60_000)
})

test('rejects an expired token', async () => {
  const token = await signRealtimeToken(user, { secret, ttlSeconds: -1 })
  await expect(verifyRealtimeToken(token, { secret })).rejects.toThrow()
})

test('rejects a token signed with another secret', async () => {
  const token = await signRealtimeToken(user, { secret: 'b'.repeat(32) })
  await expect(verifyRealtimeToken(token, { secret })).rejects.toThrow()
})

test('rejects a token issued for another audience', async () => {
  const token = await new SignJWT({ name: 'Ana', image: null })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('u1')
    .setAudience('something-else')
    .setExpirationTime('1m')
    .sign(new TextEncoder().encode(secret))
  await expect(verifyRealtimeToken(token, { secret })).rejects.toThrow()
})

test('refuses to sign with a short secret', async () => {
  await expect(signRealtimeToken(user, { secret: 'short' })).rejects.toThrow(/32/)
})
