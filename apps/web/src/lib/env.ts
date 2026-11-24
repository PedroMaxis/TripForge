import { z } from 'zod'

const schema = z.object({
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  REALTIME_SECRET: z.string().min(32),
})

let cached: z.infer<typeof schema> | undefined

/** Read on first use, so the build does not need production secrets. */
export function env() {
  cached ??= schema.parse(process.env)
  return cached
}
