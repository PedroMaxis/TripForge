import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDb(url: string) {
  return drizzle(postgres(url), { schema })
}

export type Db = ReturnType<typeof createDb>

/** Any Postgres driver, so tests can run on an in-process database. */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>
