import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from './schema'

/** In-process Postgres with the real migrations applied. */
export async function createTestDb() {
  const pg = new PGlite()
  const db = drizzle(pg, { schema })
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
  return {
    db,
    reset: () => db.execute(sql`truncate users, verifications cascade`),
    close: () => pg.close(),
  }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
