import { createDb, entriesSince, tripAccess } from '@tripforge/db'
import { z } from 'zod'
import { startServer } from './server'

const env = z
  .object({
    REALTIME_PORT: z.coerce.number().default(3001),
    REALTIME_SECRET: z.string().min(32),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
  })
  .parse(process.env)

const db = createDb(env.DATABASE_URL)
const server = await startServer({
  port: env.REALTIME_PORT,
  secret: env.REALTIME_SECRET,
  allowedOrigin: new URL(env.APP_URL).origin,
  trips: {
    access: (userId, tripId) => tripAccess(db, userId, tripId),
    entriesSince: (tripId, revision) => entriesSince(db, tripId, revision),
  },
})

const noticeSchema = z.object({ tripId: z.string() })
await db.$client.listen(
  'trip',
  (message) => {
    const notice = noticeSchema.safeParse(JSON.parse(message))
    if (notice.success) server.notify(notice.data.tripId)
  },
  // Runs again whenever the connection to Postgres comes back, when notices may have been lost.
  () => server.notifyAll(),
)
console.log(`Realtime server listening on port ${server.port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.close()
    await db.$client.end({ timeout: 5 })
    process.exit(0)
  })
}
