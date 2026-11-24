import type { Leg } from '@tripforge/core'
import { inArray } from 'drizzle-orm'
import type { AnyDb } from './client'
import { routeLegs } from './schema'

export async function findLegs(db: AnyDb, keys: string[]): Promise<Record<string, Leg>> {
  if (keys.length === 0) return {}
  const rows = await db.select().from(routeLegs).where(inArray(routeLegs.key, keys))
  return Object.fromEntries(
    rows.map(({ key, mode, meters, seconds, line }) => [key, { mode, meters, seconds, line }]),
  )
}

export async function saveLeg(db: AnyDb, key: string, leg: Leg) {
  await db
    .insert(routeLegs)
    .values({ key, ...leg })
    .onConflictDoUpdate({ target: routeLegs.key, set: { ...leg, updatedAt: new Date() } })
}
