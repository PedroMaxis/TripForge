import type {
  LogEntry,
  Operation,
  OperationRequest,
  OperationResult,
  Trip,
  TripItem,
} from '@tripforge/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createTripStore, type SendResult, type TripApi } from './trip-store'

const item = (id: string, over: Partial<TripItem> = {}): TripItem => ({
  id,
  dayId: null,
  position: id,
  kind: 'other',
  title: id,
  startTime: null,
  endTime: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  osmRef: null,
  notes: null,
  done: false,
  version: 1,
  updatedBy: null,
  ...over,
})
const base: Trip = {
  id: 't',
  title: 'BH',
  destination: 'BH',
  destinationLat: null,
  destinationLng: null,
  startDate: '2027-03-04',
  endDate: '2027-03-05',
  archivedAt: null,
  timezone: 'UTC',
  revision: 5,
  role: 'owner',
  members: [],
  days: [],
  items: [item('a')],
  group: null,
}
const rename = (title: string, id = 'a'): Operation => ({
  type: 'item.update',
  itemId: id,
  baseVersion: 1,
  fields: { title },
})
const entry = (revision: number, op: LogEntry['op'], over: Partial<LogEntry> = {}): LogEntry => ({
  revision,
  opId: `op${revision}`,
  userId: 'ana',
  userName: 'Ana',
  at: '',
  op,
  ...over,
})

let sent: OperationRequest[]
let answers: ((request: OperationRequest) => SendResult | Promise<SendResult>)[]
let api: TripApi
let saved: OperationRequest[]
let log: { entries: LogEntry[]; reset: boolean } | null
let trip: Trip | null
const ok = (result: OperationResult) => (): SendResult => ({ status: 'ok', result })
const tick = () => new Promise((r) => setTimeout(r, 5))

beforeEach(() => {
  sent = []
  answers = []
  saved = []
  log = { entries: [], reset: false }
  trip = base
  api = {
    send: async (request) => {
      sent.push(request)
      return (await answers.shift()?.(request)) ?? { status: 'offline' }
    },
    log: async () => log,
    trip: async () => trip,
    loadQueue: () => saved,
    saveQueue: (queue) => {
      saved = queue
    },
    retryMs: 10,
  }
})
const make = () => createTripStore(base, 'me', api)
const titles = (s: ReturnType<typeof make>) => s.getState().trip.items.map((i) => i.title)

describe('own changes', () => {
  test('show at once and are confirmed by the answer', async () => {
    answers = [ok({ revision: 6, item: item('a', { title: 'Novo', version: 2 }) })]
    const s = make()
    s.getState().dispatch(rename('Novo'))
    expect(titles(s)).toEqual(['Novo'])
    await tick()
    expect(s.getState()).toMatchObject({ sync: 'saved', trip: { revision: 6 } })
    expect(saved).toEqual([])
  })
  test('heard back before the answer, count once', async () => {
    let release = (_: SendResult) => {}
    answers = [
      () =>
        new Promise((r) => {
          release = r
        }),
    ]
    const s = make()
    s.getState().dispatch(rename('Novo'))
    await tick()
    s.getState().receive(
      entry(6, rename('Novo'), {
        opId: sent[0]!.opId,
        userId: 'me',
        item: item('a', { title: 'Novo', version: 2 }),
      }),
    )
    expect(s.getState().trip.revision).toBe(6)
    release({
      status: 'ok',
      result: { revision: 6, item: item('a', { title: 'Novo', version: 2 }) },
    })
    await tick()
    expect(s.getState()).toMatchObject({ sync: 'saved', trip: { revision: 6 } })
  })
  test('refused, are taken back', async () => {
    answers = [() => ({ status: 'refused', error: 'invalid' })]
    const s = make()
    s.getState().dispatch(rename('Novo'))
    await tick()
    expect(titles(s)).toEqual(['a'])
    expect(s.getState().notice).toEqual({ kind: 'rejected' })
  })
  test('on an item someone deleted, are dropped along with the rest on it, and the others go on', async () => {
    answers = [() => ({ status: 'refused', error: 'deleted' }), ok({ revision: 7 })]
    log = {
      entries: [entry(6, { type: 'item.delete', itemId: 'a' }, { item: item('a') })],
      reset: false,
    }
    const s = make()
    s.getState().dispatch(rename('1'))
    s.getState().dispatch(rename('2'))
    s.getState().dispatch({ type: 'day.update', dayId: 'd', fields: { title: 'x' } })
    await tick()
    expect(sent.map((r) => r.op.type)).toEqual(['item.update', 'day.update'])
    expect(s.getState()).toMatchObject({
      notice: { kind: 'deletedByOther', title: 'a', userName: 'Ana', itemId: 'a' },
      trip: { revision: 7, items: [] },
    })
  })
  test('once access is lost, all stops', async () => {
    answers = [() => ({ status: 'refused', error: 'forbidden' })]
    trip = null
    const s = make()
    s.getState().dispatch(rename('Novo'))
    await tick()
    expect(s.getState().revoked).toBe(true)
  })
})

describe('without connection', () => {
  test('changes wait, survive a reload and are sent marked as queued, with the same id', async () => {
    // The first visit never gets to try again: its page is gone.
    api = { ...api, retryMs: 1e9 }
    answers = [() => ({ status: 'offline' })]
    const s = make()
    s.getState().dispatch(rename('Novo'))
    await tick()
    expect(s.getState().sync).toBe('offline')
    const kept = saved
    expect(kept).toHaveLength(1)

    answers = [ok({ revision: 6, item: item('a', { title: 'Novo', version: 2 }) })]
    const before = sent.length
    const again = make()
    again.getState().start()
    expect(titles(again)).toEqual(['Novo'])
    await tick()
    expect(sent[before]).toEqual({ ...kept[0], queued: true })
    expect(saved).toEqual([])
  })
  test('a session that ended keeps the changes for after signing in', async () => {
    answers = [() => ({ status: 'signedOut' })]
    const s = make()
    s.getState().dispatch(rename('Novo'))
    await tick()
    expect(s.getState()).toMatchObject({ sync: 'signedOut', revoked: false })
    expect(saved).toHaveLength(1)
    expect(titles(s)).toEqual(['Novo'])
  })
  test('a clash is shown with both versions, and mine can be put back', async () => {
    const conflict = {
      itemId: 'a',
      userName: 'Ana',
      mine: { title: 'Meu' },
      theirs: { title: 'Dela' },
    }
    answers = [() => ({ status: 'offline' }), ok({ revision: 5, conflict })]
    log = {
      entries: [entry(6, rename('Dela'), { item: item('a', { title: 'Dela', version: 2 }) })],
      reset: false,
    }
    const s = make()
    s.getState().dispatch(rename('Meu'))
    await new Promise((r) => setTimeout(r, 40))
    expect(s.getState().conflicts).toEqual([conflict])
    await s.getState().catchUp()
    expect(titles(s)).toEqual(['Dela'])
    answers = [ok({ revision: 7, item: item('a', { title: 'Meu', version: 3 }) })]
    s.getState().settle('a', 'mine')
    expect(titles(s)).toEqual(['Meu'])
    await tick()
    expect(sent.at(-1)).toMatchObject({
      op: { type: 'item.update', baseVersion: 2, fields: { title: 'Meu' } },
    })
    expect(sent.at(-1)?.queued).toBeUndefined()
    expect(s.getState().conflicts).toEqual([])
  })
})

describe('changes by others', () => {
  test('apply under what is still on its way', async () => {
    answers = [() => new Promise(() => {})]
    const s = make()
    s.getState().dispatch(rename('Meu'))
    s.getState().receive(
      entry(
        6,
        { type: 'item.create', itemId: 'b', dayId: null, position: 'b', title: 'B', kind: 'other' },
        { item: item('b', { title: 'B' }) },
      ),
    )
    expect(titles(s)).toEqual(['Meu', 'B'])
  })
  test('old news is ignored', () => {
    const s = make()
    s.getState().receive(entry(5, rename('velho')))
    expect(titles(s)).toEqual(['a'])
  })
  test('a gap is filled from the log', async () => {
    log = {
      entries: [
        entry(6, rename('seis'), { item: item('a', { title: 'seis' }) }),
        entry(7, rename('sete'), { item: item('a', { title: 'sete' }) }),
      ],
      reset: false,
    }
    const s = make()
    s.getState().receive(entry(7, rename('sete')))
    await tick()
    expect(s.getState().trip).toMatchObject({ revision: 7, items: [{ title: 'sete' }] })
  })
  test('an answer that skips over others fills the gap too', async () => {
    answers = [ok({ revision: 7, item: item('a', { title: 'Novo', version: 3 }) })]
    const s = make()
    log = null
    s.getState().dispatch(rename('Novo'))
    log = { entries: [entry(6, { type: 'trip.update', fields: { title: 'Minas' } })], reset: false }
    await Promise.resolve()
    log.entries.push(
      entry(7, rename('Novo'), {
        opId: sent[0]!.opId,
        userId: 'me',
        item: item('a', { title: 'Novo', version: 3 }),
      }),
    )
    await tick()
    expect(s.getState()).toMatchObject({
      sync: 'saved',
      trip: { revision: 7, title: 'Minas', items: [{ title: 'Novo' }] },
    })
  })
  test('an accepted change whose gap could not be filled yet is saved once the gap arrives', async () => {
    answers = [ok({ revision: 7, item: item('a', { title: 'Novo', version: 3 }) })]
    api = {
      ...api,
      log: async () => {
        throw new Error('no connection')
      },
    }
    const s = make()
    s.getState().dispatch(rename('Novo'))
    await tick()
    expect(s.getState()).toMatchObject({
      sync: 'saving',
      trip: { revision: 5, items: [{ title: 'Novo' }] },
    })
    expect(sent).toHaveLength(1)
    s.getState().receive(entry(6, { type: 'trip.update', fields: { title: 'Minas' } }))
    s.getState().receive(
      entry(7, rename('Novo'), {
        opId: sent[0]!.opId,
        userId: 'me',
        item: item('a', { title: 'Novo', version: 3 }),
      }),
    )
    expect(s.getState()).toMatchObject({ sync: 'saved', trip: { revision: 7, title: 'Minas' } })
  })
  test('too much missed, or new dates, load the trip again', async () => {
    trip = { ...base, revision: 9, title: 'Recarregada' }
    const s = make()
    s.getState().receive(entry(6, { type: 'trip.update', fields: { endDate: '2027-03-09' } }))
    await tick()
    expect(s.getState().trip).toMatchObject({ revision: 9, title: 'Recarregada' })
    log = { entries: [], reset: true }
    trip = { ...base, revision: 500 }
    await s.getState().catchUp()
    expect(s.getState().trip.revision).toBe(500)
  })
  test('the open item being deleted is said, and only then', () => {
    const s = make()
    s.getState().receive(entry(6, { type: 'item.delete', itemId: 'a' }, { item: item('a') }))
    expect(s.getState().notice).toBeNull()
    const open = make()
    open.getState().watch('a')
    open.getState().receive(entry(6, { type: 'item.delete', itemId: 'a' }, { item: item('a') }))
    expect(open.getState().notice).toEqual({
      kind: 'deletedByOther',
      itemId: 'a',
      title: 'a',
      userName: 'Ana',
    })
  })
  test('writing over a field I just changed is said', async () => {
    answers = [ok({ revision: 6, item: item('a', { title: 'Meu', version: 2 }) })]
    const s = make()
    s.getState().dispatch(rename('Meu'))
    await tick()
    s.getState().receive(
      entry(7, rename('Dela'), { item: item('a', { title: 'Dela', version: 3 }) }),
    )
    expect(titles(s)).toEqual(['Dela'])
    expect(s.getState().notice).toEqual({ kind: 'overwritten', title: 'Dela', userName: 'Ana' })
  })
  test('but not a field I did not touch', async () => {
    answers = [ok({ revision: 6, item: item('a', { title: 'Meu', version: 2 }) })]
    const s = make()
    s.getState().dispatch(rename('Meu'))
    await tick()
    s.getState().receive(
      entry(
        7,
        { type: 'item.update', itemId: 'a', baseVersion: 2, fields: { notes: 'x' } },
        { item: item('a', { title: 'Meu', notes: 'x', version: 3 }) },
      ),
    )
    expect(s.getState().notice).toBeNull()
  })
  test('being removed is final', () => {
    const s = make()
    s.getState().revoke()
    expect(s.getState().revoked).toBe(true)
    s.getState().dispatch(rename('x'))
    expect(sent).toEqual([])
  })
})

test('catching up while already catching up asks once', async () => {
  const spy = vi.fn(api.log)
  api.log = spy
  const s = make()
  await Promise.all([s.getState().catchUp(), s.getState().catchUp()])
  expect(spy).toHaveBeenCalledTimes(1)
})
