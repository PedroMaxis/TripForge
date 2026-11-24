import { signRealtimeToken } from '@tripforge/core'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { type RealtimeServer, startServer } from './server'

const secret = 's'.repeat(32)
const user = { userId: 'u1', name: 'Ana', image: null }
let server: RealtimeServer
let sockets: Socket[] = []

beforeEach(async () => {
  server = await startServer({ port: 0, secret, allowedOrigin: 'http://localhost:3000' })
})
afterEach(async () => {
  for (const s of sockets) s.disconnect()
  sockets = []
  await server.close()
})

function connect(token?: string) {
  const s = io(`http://localhost:${server.port}`, {
    auth: token ? { token } : {},
    reconnection: false,
    transports: ['websocket'],
  })
  sockets.push(s)
  return s
}

const next = <T>(s: Socket, event: string) => new Promise<T>((resolve) => s.once(event, resolve))

test('answers the health check', async () => {
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok' })
})

test('returns 404 for other paths', async () => {
  expect((await fetch(`http://localhost:${server.port}/nope`)).status).toBe(404)
})

test('refuses a connection without a token', async () => {
  const err = await next<Error>(connect(), 'connect_error')
  expect(err.message).toBe('unauthorized')
})

test('refuses a token signed with another secret', async () => {
  const token = await signRealtimeToken(user, { secret: 'x'.repeat(32) })
  const err = await next<Error>(connect(token), 'connect_error')
  expect(err.message).toBe('unauthorized')
})

test('tells the client who it is connected as', async () => {
  const s = connect(await signRealtimeToken(user, { secret }))
  expect(await next(s, 'session.ready')).toEqual({ userId: 'u1' })
})

test('closes the socket when its token expires', async () => {
  const s = connect(await signRealtimeToken(user, { secret, ttlSeconds: 1 }))
  expect(await next(s, 'disconnect')).toBe('io server disconnect')
})

test('keeps the socket open past the old expiry once the token is renewed', async () => {
  const s = connect(await signRealtimeToken(user, { secret, ttlSeconds: 2 }))
  await next(s, 'session.ready')
  const renewed = await signRealtimeToken(user, { secret, ttlSeconds: 60 })
  expect(await s.emitWithAck('session.renew', { token: renewed })).toEqual({ ok: true })
  await new Promise((r) => setTimeout(r, 2500))
  expect(s.connected).toBe(true)
})

test("does not renew with another user's token", async () => {
  const s = connect(await signRealtimeToken(user, { secret }))
  await next(s, 'session.ready')
  const other = await signRealtimeToken({ ...user, userId: 'u2' }, { secret })
  expect(await s.emitWithAck('session.renew', { token: other })).toEqual({ ok: false })
})

test('survives a malformed renewal', async () => {
  const s = connect(await signRealtimeToken(user, { secret }))
  await next(s, 'session.ready')
  s.emit('session.renew')
  expect(await s.emitWithAck('session.renew', null)).toEqual({ ok: false })
  expect(s.connected).toBe(true)
})
