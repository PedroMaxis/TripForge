import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type RealtimeUser, verifyRealtimeToken } from '@tripforge/core'
import { Server } from 'socket.io'
import { z } from 'zod'

const tokenPayload = z.object({ token: z.string() })

type SocketData = { user: RealtimeUser; expiresAt: number }
type Ack = (result: { ok: boolean }) => void

type ServerEvents = { 'session.ready': (session: { userId: string }) => void }
type ClientEvents = { 'session.renew': (payload?: unknown, ack?: Ack) => void }

export type RealtimeServer = { port: number; close: () => Promise<void> }

export async function startServer({
  port,
  secret,
  allowedOrigin,
}: {
  port: number
  secret: string
  allowedOrigin: string
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
    socket.on('disconnect', () => clearTimeout(expiry))

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

    socket.emit('session.ready', { userId: socket.data.user.userId })
  })

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(port, resolve)
  })

  return {
    port: (http.address() as AddressInfo).port,
    // Also closes the underlying HTTP server.
    close: () => io.close(),
  }
}
