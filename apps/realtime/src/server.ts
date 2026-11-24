import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  type LogEntry,
  type Presence,
  type RealtimeUser,
  verifyRealtimeToken,
} from '@tripforge/core'
import { Server } from 'socket.io'
import { z } from 'zod'
import { createRooms, type TripSource } from './rooms'

const tokenPayload = z.object({ token: z.string() })
const tripPayload = z.object({ tripId: z.uuid() })
const editingPayload = z.object({ tripId: z.uuid(), itemId: z.uuid().nullable() })

type SocketData = { user: RealtimeUser; expiresAt: number }
type Ack<T> = (result: T) => void
type JoinResult = { ok: true; revision: number } | { ok: false }

type ServerEvents = {
  'session.ready': (session: { userId: string }) => void
  'trip.entry': (tripId: string, entry: LogEntry) => void
  'trip.presence': (tripId: string, people: Presence[]) => void
  'trip.revoked': (tripId: string) => void
}
type ClientEvents = {
  'session.renew': (payload?: unknown, ack?: Ack<{ ok: boolean }>) => void
  'trip.join': (payload?: unknown, ack?: Ack<JoinResult>) => void
  'trip.leave': (payload?: unknown) => void
  'trip.editing': (payload?: unknown) => void
}

export type RealtimeServer = {
  port: number
  notify: (tripId: string) => void
  notifyAll: () => void
  close: () => Promise<void>
}

const roomOf = (tripId: string) => `trip:${tripId}`

export async function startServer({
  port,
  secret,
  allowedOrigin,
  trips,
}: {
  port: number
  secret: string
  allowedOrigin: string
  trips: TripSource
}): Promise<RealtimeServer> {
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}')
    } else {
      res.writeHead(404).end()
    }
  })

  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(http, {
    cors: { origin: allowedOrigin },
    serveClient: false,
    maxHttpBufferSize: 10_000,
  })

  // Each process tells only its own sockets, so several can listen to the same database.
  const rooms = createRooms(trips, {
    entry: (tripId, entry) => io.local.to(roomOf(tripId)).emit('trip.entry', tripId, entry),
    presence: (tripId, people) => io.local.to(roomOf(tripId)).emit('trip.presence', tripId, people),
    evict: (tripId, userId) => {
      for (const id of io.of('/').adapter.rooms.get(roomOf(tripId)) ?? []) {
        const socket = io.sockets.sockets.get(id)
        if (socket?.data.user.userId !== userId) continue
        socket.leave(roomOf(tripId))
        socket.emit('trip.revoked', tripId)
      }
    },
  })

  async function authenticate(payload: unknown): Promise<SocketData> {
    const { token } = tokenPayload.parse(payload)
    const { expiresAt, ...user } = await verifyRealtimeToken(token, { secret })
    return { user, expiresAt }
  }

  io.use(async (socket, next) => {
    try {
      socket.data = await authenticate(socket.handshake.auth)
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    let expiry: NodeJS.Timeout
    const closeOnExpiry = () => {
      clearTimeout(expiry)
      expiry = setTimeout(() => socket.disconnect(true), socket.data.expiresAt - Date.now())
    }
    closeOnExpiry()
    socket.on('disconnect', () => {
      clearTimeout(expiry)
      rooms.leaveAll(socket.id)
    })

    socket.on('session.renew', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      try {
        const renewed = await authenticate(payload)
        if (renewed.user.userId !== socket.data.user.userId) throw new Error('user mismatch')
        if (!socket.connected) return
        socket.data = renewed
        closeOnExpiry()
        reply({ ok: true })
      } catch {
        reply({ ok: false })
      }
    })

    socket.on('trip.join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const parsed = tripPayload.safeParse(payload)
      if (!parsed.success) return reply({ ok: false })
      const { tripId } = parsed.data
      try {
        // Into the room only once access is known, and before the presence this causes.
        const revision = await rooms.join(tripId, socket.id, socket.data.user, () => {
          socket.join(roomOf(tripId))
        })
        if (revision === null) {
          socket.leave(roomOf(tripId))
          return reply({ ok: false })
        }
        if (!socket.connected) return rooms.leaveAll(socket.id)
        reply({ ok: true, revision })
      } catch {
        reply({ ok: false })
      }
    })

    socket.on('trip.leave', (payload) => {
      const parsed = tripPayload.safeParse(payload)
      if (!parsed.success) return
      socket.leave(roomOf(parsed.data.tripId))
      rooms.leave(parsed.data.tripId, socket.id)
    })

    socket.on('trip.editing', (payload) => {
      const parsed = editingPayload.safeParse(payload)
      if (parsed.success) rooms.edit(parsed.data.tripId, socket.id, parsed.data.itemId)
    })

    socket.emit('session.ready', { userId: socket.data.user.userId })
  })

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(port, resolve)
  })

  return {
    port: (http.address() as AddressInfo).port,
    notify: (tripId) => rooms.notify(tripId),
    notifyAll: () => rooms.notifyAll(),
    // Also closes the underlying HTTP server.
    close: () => io.close(),
  }
}
