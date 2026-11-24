import {
  applyLocally,
  byPosition,
  type Operation,
  type OperationRequest,
  positionBetween,
  type Trip,
  type TripItem,
  withItem,
} from '@tripforge/core'
import { createStore } from 'zustand'

export type SyncState = 'saved' | 'saving' | 'offline'
export type Undo = { kind: 'moved' | 'deleted'; title: string; op: Operation }

type TripStore = {
  /** What the screen shows: the confirmed trip plus the changes still on their way. */
  trip: Trip
  sync: SyncState
  rejected: boolean
  undo: Undo | null
  dispatch: (op: Operation, undo?: Undo) => void
  dismiss: () => void
}

const retryDelay = 2000

export function itemsOf(trip: Trip, dayId: string | null) {
  return trip.items.filter((i) => i.dayId === dayId).sort(byPosition)
}

/** The key that puts an item at an index of a list, not counting the item itself. */
export function positionAt(trip: Trip, dayId: string | null, index: number, movingId?: string) {
  const others = itemsOf(trip, dayId).filter((i) => i.id !== movingId)
  const before = others[index - 1]?.position ?? null
  // Equal neighbors leave no room between them; the server settles it.
  const after = others.slice(index).find((i) => before === null || i.position > before)
  return positionBetween(before, after?.position ?? null)
}

export function createTripStore(initial: Trip) {
  let confirmed = initial
  let queue: OperationRequest[] = []
  let sending = false

  return createStore<TripStore>()((set) => {
    const show = (extra: Partial<TripStore> = {}) =>
      set({ trip: queue.reduce((trip, { op }) => applyLocally(trip, op), confirmed), ...extra })

    async function reload() {
      const res = await fetch(`/api/trips/${initial.id}`)
      if (res.ok) confirmed = (await res.json()) as Trip
    }

    async function send() {
      if (sending) return
      sending = true
      for (let next = queue[0]; next; next = queue[0]) {
        const request = next
        let res: Response | undefined
        try {
          res = await fetch(`/api/trips/${initial.id}/operations`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
          })
        } catch {
          // No connection: handled below like a server that is down.
        }
        if (!res || res.status >= 500) {
          set({ sync: 'offline' })
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
          continue // Same opId, so the server never applies it twice.
        }
        if (!res.ok) {
          queue = []
          await reload().catch(() => {})
          show({ rejected: true, undo: null })
          break
        }
        const { revision, item } = (await res.json()) as { revision: number; item?: TripItem }
        queue = queue.slice(1)
        confirmed = { ...applyLocally(confirmed, request.op), revision }
        if (item && request.op.type !== 'item.delete') confirmed = withItem(confirmed, item)
        show({ sync: queue.length ? 'saving' : 'saved' })
      }
      sending = false
      set({ sync: 'saved' })
    }

    return {
      trip: initial,
      sync: 'saved',
      rejected: false,
      undo: null,
      dispatch(op, undo) {
        queue = [...queue, { opId: crypto.randomUUID(), op }]
        show({ sync: 'saving', rejected: false, undo: undo ?? null })
        void send()
      },
      dismiss: () => set({ undo: null, rejected: false }),
    }
  })
}
