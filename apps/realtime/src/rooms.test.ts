import { randomUUID } from 'node:crypto'
import { type LogEntry, type Operation, signRealtimeToken } from '@tripforge/core'
import {
  applyOperation,
  changeMember,
  createTrip,
  entriesSince,
  tripAccess,
  tripMembers,
  users,
} from '@tripforge/db'
import { createTestDb, type TestDb } from '@tripforge/db/testing'
import { io, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { type RealtimeServer, startServer } from './server'

const secret = 's'.repeat(32)
let t: TestDb
let server: RealtimeServer
let tripId: string
let sockets: Socket[] = []

beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())
beforeEach(async () => {
  await t.reset()
  await t.db
    .insert(users)
    .values(
      ['owner', 'ana', 'stranger'].map((id) => ({ id, name: id, email: `${id}@example.com` })),
    )
  tripId = await createTrip(t.db, 'owner', {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'UTC',
  })
  await t.db.insert(tripMembers).values({ tripId, userId: 'ana', role: 'editor' })
  server = await startServer({
    port: 0,
    secret,
    allowedOrigin: 'http://localhost:3000',
    trips: {
      access: (userId, id) => tripAccess(t.db, userId, id),
      entriesSince: (id, revision) => entriesSince(t.db, id, revision),
    },
  })
})
afterEach(async () => {
  for (const s of sockets) s.disconnect()
  sockets = []
  await server.close()
})

async function connect(userId: string) {
  const token = await signRealtimeToken({ userId, name: userId, image: null }, { secret })
  const socket = io(`http://localhost:${server.port}`, {
    auth: { token },
    reconnection: false,
    transports: ['websocket'],
  })
  sockets.push(socket)
  const entries: LogEntry[] = []
  let presence: { userId: string; editing: string | null }[] = []
  let revoked = false
  socket.on('trip.entry', (_: string, e: LogEntry) => entries.push(e))
  socket.on('trip.presence', (_: string, p: typeof presence) => {
    presence = p
  })
  socket.on('trip.revoked', () => {
    revoked = true
  })
  await new Promise((r) => socket.once('session.ready', r))
  return {
    socket,
    entries,
    presence: () => presence,
    revoked: () => revoked,
    join: () => socket.emitWithAck('trip.join', { tripId }),
  }
}
async function write(op: Operation, userId = 'owner') {
  await applyOperation(t.db, { userId, tripId, opId: randomUUID(), op })
  server.notify(tripId)
}
const create = (title: string): Operation => ({
  type: 'item.create',
  itemId: randomUUID(),
  dayId: null,
  position: 'a0',
  title,
  kind: 'other',
})

describe('joining', () => {
  test('a member joins and learns the revision', async () => {
    await write(create('A'))
    expect(await (await connect('ana')).join()).toEqual({ ok: true, revision: 1 })
  })
  test('a stranger does not, and hears nothing', async () => {
    const s = await connect('stranger')
    expect(await s.join()).toEqual({ ok: false })
    await write(create('A'))
    await new Promise((r) => setTimeout(r, 100))
    expect(s.entries).toEqual([])
  })
  test('nonsense is refused', async () => {
    const s = await connect('ana')
    expect(await s.socket.emitWithAck('trip.join', null)).toEqual({ ok: false })
    expect(await s.socket.emitWithAck('trip.join', { tripId: 'x' })).toEqual({ ok: false })
  })
})

test('someone removed while joining does not get in', async () => {
  let calls = 0
  const { createRooms } = await import('./rooms')
  let admitted = false
  const told: string[] = []
  const rooms = createRooms(
    { access: async () => (calls++ === 0 ? { revision: 0 } : null), entriesSince: async () => [] },
    { entry: () => {}, evict: () => {}, presence: (id) => told.push(id) },
  )
  const joined = await rooms.join('t', 's', { userId: 'u', name: 'u', image: null }, () => {
    admitted = true
  })
  expect([joined, admitted, told]).toEqual([null, true, []])
})

describe('changes', () => {
  test('reach everyone in the trip, in order, exactly once', async () => {
    const [a, b] = [await connect('owner'), await connect('ana')]
    await a.join()
    await b.join()
    await Promise.all(['1', '2', '3', '4'].map((x) => write(create(x))))
    for (let i = 0; i < 5; i++) server.notify(tripId)
    for (const s of [a, b])
      await expect.poll(() => s.entries.map((e) => e.revision)).toEqual([1, 2, 3, 4])
    await new Promise((r) => setTimeout(r, 100))
    expect(b.entries).toHaveLength(4)
  })
  test('stay inside their trip', async () => {
    const other = await createTrip(t.db, 'owner', {
      title: 'X',
      destination: 'X',
      startDate: '2027-03-04',
      endDate: '2027-03-04',
      timezone: 'UTC',
    })
    const a = await connect('ana')
    await a.join()
    await applyOperation(t.db, {
      userId: 'owner',
      tripId: other,
      opId: randomUUID(),
      op: create('Y'),
    })
    server.notify(other)
    await new Promise((r) => setTimeout(r, 100))
    expect(a.entries).toEqual([])
  })
  test('missed while not listening are caught up', async () => {
    const a = await connect('ana')
    await a.join()
    await applyOperation(t.db, { userId: 'owner', tripId, opId: randomUUID(), op: create('A') })
    server.notifyAll()
    await expect.poll(() => a.entries.length).toBe(1)
  })
  test('stop after leaving', async () => {
    const a = await connect('ana')
    await a.join()
    a.socket.emit('trip.leave', { tripId })
    await new Promise((r) => setTimeout(r, 50))
    await write(create('A'))
    await new Promise((r) => setTimeout(r, 100))
    expect(a.entries).toEqual([])
  })
})

describe('losing access', () => {
  test('a removed person is told and hears nothing more', async () => {
    const [a, b] = [await connect('ana'), await connect('owner')]
    await a.join()
    await b.join()
    await changeMember(t.db, 'owner', tripId, 'ana', null)
    server.notify(tripId)
    await expect.poll(() => a.revoked()).toBe(true)
    await write(create('secret'))
    await expect.poll(() => b.entries.length).toBe(2)
    expect(a.entries).toEqual([])
    expect(await a.join()).toEqual({ ok: false })
    expect(b.presence().map((p) => p.userId)).toEqual(['owner'])
  })
})

describe('presence', () => {
  test('shows who is here, once per person, and what they edit', async () => {
    const [a, b, b2] = [await connect('owner'), await connect('ana'), await connect('ana')]
    await a.join()
    await b.join()
    await b2.join()
    const itemId = randomUUID()
    b.socket.emit('trip.editing', { tripId, itemId })
    await expect
      .poll(() => a.presence().map((p) => [p.userId, p.editing]))
      .toEqual([
        ['ana', itemId],
        ['owner', null],
      ])
    b.socket.disconnect()
    await expect
      .poll(() => a.presence().map((p) => [p.userId, p.editing]))
      .toEqual([
        ['ana', null],
        ['owner', null],
      ])
    b2.socket.disconnect()
    await expect.poll(() => a.presence().map((p) => p.userId)).toEqual(['owner'])
  })
  test('cannot be faked from outside the trip', async () => {
    const [a, s] = [await connect('owner'), await connect('stranger')]
    await a.join()
    s.socket.emit('trip.editing', { tripId, itemId: randomUUID() })
    await new Promise((r) => setTimeout(r, 100))
    expect(a.presence().map((p) => p.userId)).toEqual(['owner'])
  })
})
