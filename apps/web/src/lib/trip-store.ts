import {
  applyEntry,
  applyLocally,
  byPosition,
  type Conflict,
  type LogEntry,
  type Operation,
  type OperationErrorCode,
  type OperationRequest,
  type OperationResult,
  positionBetween,
  type Trip,
  withItem,
} from '@tripforge/core'
import { createStore } from 'zustand'

export type SyncState = 'saved' | 'saving' | 'offline' | 'signedOut'
export type Undo = { kind: 'moved' | 'deleted'; title: string; op: Operation }
export type Notice =
  | { kind: 'rejected' }
  | { kind: 'deletedByOther'; itemId: string; title: string; userName: string }
  | { kind: 'overwritten'; title: string; userName: string }

export type SendResult =
  | { status: 'ok'; result: OperationResult }
  | { status: 'refused'; error: OperationErrorCode }
  | { status: 'offline' }
  | { status: 'signedOut' }

/** Everything the store needs from outside. */
export type TripApi = {
  send: (request: OperationRequest) => Promise<SendResult>
  /** What happened after a revision, or null when the trip is no longer ours to see. */
  log: (since: number) => Promise<{ entries: LogEntry[]; reset: boolean } | null>
  trip: () => Promise<Trip | null>
  loadQueue: () => OperationRequest[]
  saveQueue: (queue: OperationRequest[]) => void
  retryMs: number
}

type TripStore = {
  /** What the screen shows: the confirmed trip plus the changes still on their way. */
  trip: Trip
  sync: SyncState
  undo: Undo | null
  notice: Notice | null
  conflicts: Conflict[]
  /** No longer part of this trip. */
  revoked: boolean
  /** Picks up what an earlier visit could not send. */
  start: () => void
  dispatch: (op: Operation, undo?: Undo) => void
  receive: (entry: LogEntry) => void
  catchUp: () => Promise<void>
  /** Says which item is open, so its disappearance can be explained. */
  watch: (itemId: string | null) => void
  settle: (itemId: string, keep: 'mine' | 'theirs') => void
  revoke: () => void
  dismiss: () => void
}

const overwriteWindowMs = 10_000

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

const itemOf = (op: LogEntry['op']) => ('itemId' in op ? op.itemId : null)

export function createTripStore(initial: Trip, userId: string, api: TripApi) {
  let confirmed = initial
  let queue: OperationRequest[] = []
  /** Accepted by the server, but with changes of others before them still to come. */
  const accepted = new Set<string>()
  const ownEdits = new Map<string, number>()
  let sending = false
  let catching: Promise<void> | null = null
  let watching: string | null = null

  return createStore<TripStore>()((set, get) => {
    function show(extra: Partial<TripStore> = {}) {
      const trip = queue.reduce((current, { op }) => applyLocally(current, op), confirmed)
      // The last change may be confirmed by what others tell us rather than by its own answer.
      const done = queue.length === 0 && !sending && get().sync === 'saving'
      set({ trip, ...(done && { sync: 'saved' as const }), ...extra })
    }

    function setQueue(next: OperationRequest[]) {
      queue = next
      for (const id of accepted) if (!queue.some((r) => r.opId === id)) accepted.delete(id)
      api.saveQueue(queue)
    }
    const drop = (opId: string) => setQueue(queue.filter((r) => r.opId !== opId))

    function explain(entry: LogEntry) {
      const { op } = entry
      if (entry.userId === userId) return
      if (op.type === 'item.delete' && op.itemId === watching) {
        const title =
          confirmed.items.find((i) => i.id === op.itemId)?.title ?? entry.item?.title ?? ''
        set({
          notice: { kind: 'deletedByOther', itemId: op.itemId, title, userName: entry.userName },
        })
      }
      if (op.type === 'item.update') {
        const overwritten = Object.keys(op.fields).some((field) => {
          const at = ownEdits.get(`${op.itemId}:${field}`)
          return at !== undefined && Date.now() - at < overwriteWindowMs
        })
        if (overwritten) {
          const title = entry.item?.title ?? ''
          set({ notice: { kind: 'overwritten', title, userName: entry.userName } })
        }
      }
    }

    /** Takes the next change in order. False when the trip has to be loaded again. */
    function take(entry: LogEntry) {
      if (entry.revision <= confirmed.revision) return true
      explain(entry)
      const next = applyEntry(confirmed, entry)
      drop(entry.opId)
      if (next) confirmed = next
      return next !== null
    }

    async function reload() {
      const trip = await api.trip()
      if (!trip) return get().revoke()
      confirmed = trip
      // Whatever was accepted is part of what was just loaded.
      setQueue(queue.filter((r) => !accepted.has(r.opId)))
    }

    async function fetchMissed() {
      try {
        const log = await api.log(confirmed.revision)
        if (!log) return get().revoke()
        if (log.reset || !log.entries.every(take)) await reload()
        show()
      } catch {
        // No connection; it is tried again when there is one.
      }
    }

    function catchUp() {
      catching ??= fetchMissed().finally(() => {
        catching = null
      })
      return catching
    }

    async function settleAnswer({ opId, op }: OperationRequest, result: OperationResult) {
      if (result.conflict) {
        const { conflict } = result
        set({
          conflicts: [...get().conflicts.filter((c) => c.itemId !== conflict.itemId), conflict],
        })
        // The answer is about a newer trip than ours, and not about what was asked.
        drop(opId)
        await catchUp()
        return
      }
      if (result.revision <= confirmed.revision) return drop(opId)
      if (result.revision > confirmed.revision + 1) {
        accepted.add(opId)
        await catchUp()
        return
      }
      confirmed = { ...applyLocally(confirmed, op), revision: result.revision }
      if (result.item && op.type !== 'item.delete') confirmed = withItem(confirmed, result.item)
      drop(opId)
    }

    async function settleRefusal(request: OperationRequest, error: string) {
      const itemId = itemOf(request.op)
      if (error === 'deleted' && itemId) {
        const title = get().trip.items.find((i) => i.id === itemId)?.title ?? ''
        setQueue(queue.filter((r) => itemOf(r.op) !== itemId))
        const was = watching
        watching = itemId
        await catchUp()
        watching = was
        if (get().notice?.kind !== 'deletedByOther') {
          set({ notice: { kind: 'deletedByOther', itemId, title, userName: '' } })
        }
        return
      }
      setQueue([])
      await reload().catch(() => {})
      if (!get().revoked) set({ notice: { kind: 'rejected' }, undo: null })
    }

    async function send() {
      if (sending || get().revoked) return
      sending = true
      for (;;) {
        const request = queue.find((r) => !accepted.has(r.opId))
        if (!request || get().revoked) break
        const answer = await api.send(request)
        if (answer.status === 'offline') {
          // From now on it may be older than what others do meanwhile.
          setQueue(queue.map((r) => ({ ...r, queued: true })))
          set({ sync: 'offline' })
          await new Promise((resolve) => setTimeout(resolve, api.retryMs))
          continue // Same opId, so the server never applies it twice.
        }
        if (answer.status === 'signedOut') {
          // Kept for after signing in again.
          setQueue(queue.map((r) => ({ ...r, queued: true })))
          set({ sync: 'signedOut' })
          sending = false
          return
        }
        if (answer.status === 'ok') await settleAnswer(request, answer.result)
        else await settleRefusal(request, answer.error)
        show({ sync: queue.length ? 'saving' : 'saved' })
      }
      sending = false
      if (!queue.length) set({ sync: 'saved' })
    }

    function enqueue(request: OperationRequest, extra: Partial<TripStore>) {
      setQueue([...queue, request])
      const { sync } = get()
      show({ sync: sync === 'saved' ? 'saving' : sync, notice: null, ...extra })
      void send()
    }

    return {
      trip: initial,
      sync: 'saved',
      undo: null,
      notice: null,
      conflicts: [],
      revoked: false,

      start() {
        const left = api.loadQueue()
        if (left.length === 0 || queue.length > 0) return
        setQueue(left.map((r) => ({ ...r, queued: true })))
        show({ sync: 'saving' })
        void send()
      },

      dispatch(op, undo) {
        if (get().revoked) return
        if (op.type === 'item.update') {
          for (const field of Object.keys(op.fields))
            ownEdits.set(`${op.itemId}:${field}`, Date.now())
        }
        const queued = get().sync === 'offline' || get().sync === 'signedOut'
        enqueue(
          { opId: crypto.randomUUID(), op, ...(queued && { queued }) },
          { undo: undo ?? null },
        )
      },

      receive(entry) {
        if (entry.revision <= confirmed.revision || get().revoked) return
        if (entry.revision > confirmed.revision + 1) {
          void catchUp()
          return
        }
        if (take(entry)) show()
        else
          void reload()
            .then(() => show())
            .catch(() => {})
      },

      catchUp,

      watch(itemId) {
        watching = itemId
      },

      settle(itemId, keep) {
        const conflict = get().conflicts.find((c) => c.itemId === itemId)
        set({ conflicts: get().conflicts.filter((c) => c.itemId !== itemId) })
        const item = confirmed.items.find((i) => i.id === itemId)
        if (!conflict || keep === 'theirs' || !item) return
        const fields = conflict.mine as Extract<Operation, { type: 'item.update' }>['fields']
        get().dispatch({ type: 'item.update', itemId, baseVersion: item.version, fields })
      },

      revoke() {
        setQueue([])
        set({ revoked: true, undo: null, notice: null, conflicts: [] })
      },

      dismiss: () => set({ undo: null, notice: null }),
    }
  })
}
