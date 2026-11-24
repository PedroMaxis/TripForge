import type { OperationErrorCode, OperationResult, Trip } from '@tripforge/core'
import { createQueueStorage } from './queue-storage'
import type { TripApi } from './trip-store'

const retryMs = 2000

/** The store's way out: our HTTP API, and the browser's storage for what could not be sent. */
export function createTripApi(tripId: string, userId: string): TripApi {
  const base = `/api/trips/${tripId}`
  let storage: ReturnType<typeof createQueueStorage> | undefined
  const queueStorage = () => {
    storage ??= createQueueStorage(`tripforge:queue:${userId}:${tripId}`, localStorage)
    return storage
  }

  async function get<T>(url: string): Promise<T | null> {
    const res = await fetch(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${url} answered ${res.status}`)
    return (await res.json()) as T
  }

  return {
    retryMs,
    async send(request) {
      let res: Response
      try {
        res = await fetch(`${base}/operations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        if (res.ok) return { status: 'ok', result: (await res.json()) as OperationResult }
      } catch {
        return { status: 'offline' }
      }
      if (res.status === 401) return { status: 'signedOut' }
      if (res.status >= 500 || res.status === 429) return { status: 'offline' }
      const { error } = (await res.json().catch(() => ({}))) as { error?: OperationErrorCode }
      return { status: 'refused', error: error ?? 'invalid' }
    },
    log: (since) => get(`${base}/log?since=${since}`),
    trip: () => get<Trip>(base),
    loadQueue: () => queueStorage().load(),
    saveQueue: (queue) => queueStorage().save(queue),
  }
}
