import { z } from 'zod'
import { startServer } from './server'

const env = z
  .object({
    REALTIME_PORT: z.coerce.number().default(3001),
    REALTIME_SECRET: z.string().min(32),
    APP_URL: z.url(),
  })
  .parse(process.env)

const server = await startServer({
  port: env.REALTIME_PORT,
  secret: env.REALTIME_SECRET,
  allowedOrigin: new URL(env.APP_URL).origin,
})
console.log(`Realtime server listening on port ${server.port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
