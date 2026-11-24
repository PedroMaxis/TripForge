// A real Postgres 16 for development on machines without Docker. Data lives in .postgres/ at the repo root.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = fileURLToPath(
  new URL(`../../../${process.env.DEV_POSTGRES_DIR ?? '.postgres/dev'}`, import.meta.url),
)
const port = Number(process.env.DEV_POSTGRES_PORT ?? 5432)
const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'tripforge',
  password: 'tripforge',
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C.UTF-8'],
  onLog: () => {},
})

const isNew = !existsSync(databaseDir)
if (isNew) await pg.initialise()
await pg.start()
if (isNew) await pg.createDatabase('tripforge')
console.log(`Postgres ready at postgres://tripforge:tripforge@localhost:${port}/tripforge`)
