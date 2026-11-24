import { saveLeg } from '@tripforge/db'
import { db } from './db'
import { env } from './env'
import { createRouter } from './routing'

// One queue for the whole process, or the routing server would be asked too fast.
const store = globalThis as unknown as { tripforgeRouter?: ReturnType<typeof createRouter> }

export function router() {
  const { ROUTING_URL, ROUTING_INTERVAL_MS } = env()
  store.tripforgeRouter ??= createRouter({
    url: ROUTING_URL === 'off' ? undefined : ROUTING_URL,
    intervalMs: ROUTING_INTERVAL_MS,
    save: (key, leg) => saveLeg(db(), key, leg),
  })
  return store.tripforgeRouter
}
