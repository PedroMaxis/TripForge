import { type OperationRequest, operationRequestSchema } from '@tripforge/core'
import { z } from 'zod'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

const queueSchema = z.array(operationRequestSchema)

/** The unsent changes of a trip, shared by every tab without one erasing another's. */
export function createQueueStorage(key: string, storage: Storage) {
  let own = new Set<string>()

  function read(): OperationRequest[] {
    try {
      return queueSchema.parse(JSON.parse(storage.getItem(key) ?? '[]'))
    } catch {
      return []
    }
  }

  return {
    load() {
      const queue = read()
      own = new Set(queue.map((r) => r.opId))
      return queue
    },
    save(queue: OperationRequest[]) {
      const ids = new Set(queue.map((r) => r.opId))
      const all = [...read().filter((r) => !own.has(r.opId) && !ids.has(r.opId)), ...queue]
      own = ids
      try {
        if (all.length > 0) storage.setItem(key, JSON.stringify(all))
        else storage.removeItem(key)
      } catch {
        // Full or blocked: the changes still live as long as the page does.
      }
    },
  }
}
