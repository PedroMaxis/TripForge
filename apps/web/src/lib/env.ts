import { z } from 'zod'

const optional = z
  .string()
  .optional()
  .transform((v) => v || undefined)
const withDefault = (value: string) =>
  z
    .string()
    .optional()
    .transform((v) => v || value)

const schema = z.object({
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  REALTIME_SECRET: z.string().min(32),
  PHOTON_URL: withDefault('https://photon.komoot.io'),
  /** "off" turns street routes off. */
  ROUTING_URL: withDefault('https://routing.openstreetmap.de'),
  ROUTING_INTERVAL_MS: z.coerce.number().int().positive().default(1100),
  MAP_STYLE_URL: withDefault('https://tiles.openfreemap.org/styles/positron'),
  TERRAIN_URL: withDefault(
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ),
  /** Without it, nobody can recover a password by email. */
  SMTP_URL: optional,
  MAIL_FROM: withDefault('TripForge <no-reply@localhost>'),
})

let cached: z.infer<typeof schema> | undefined

/** Read on first use, so the build does not need production secrets. */
export function env() {
  cached ??= schema.parse(process.env)
  return cached
}
