import { createDb, type Db } from '@tripforge/db'
import { env } from './env'

// Kept on globalThis so hot reloads in development reuse the connection pool.
const store = globalThis as unknown as { tripforgeDb?: Db }

export function db() {
  store.tripforgeDb ??= createDb(env().DATABASE_URL)
  return store.tripforgeDb
}
