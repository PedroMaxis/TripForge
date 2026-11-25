import { describe, expect, test } from 'vitest'
import {
  applyEntry,
  applyLocally,
  type Expense,
  emptyGroup,
  forViewer,
  type LogEntry,
  type Operation,
  operationSchema,
  settlements,
  sharesOf,
  type Trip,
} from './index'

const by = { userId: 'ana', at: '2027-03-04T10:00:00.000Z' }
const trip = (group = emptyGroup()) =>
  ({ revision: 1, role: 'editor', days: [], members: [], items: [], group }) as unknown as Trip
const after = (...ops: Operation[]) =>
  ops.reduce((current, op) => applyLocally(current, op, by), trip()).group!
const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e',
  title: 'Airbnb',
  amount: 10000,
  currency: 'BRL',
  paidBy: 'ana',
  split: ['ana', 'bob', 'cris'],
  date: '2027-03-04',
  payment: false,
  ...over,
})

describe('what the group keeps', () => {
  test('a vote is cast once and can be taken back', () => {
    const vote = (on: boolean): Operation => ({ type: 'item.vote', itemId: 'i', on })
    expect(after(vote(true), vote(true)).votes).toEqual([{ itemId: 'i', userId: 'ana' }])
    expect(after(vote(true), vote(false)).votes).toEqual([])
  })
  test('comments say who and when', () => {
    const create: Operation = { type: 'comment.create', commentId: 'c', itemId: 'i', body: 'Oi' }
    expect(after(create).comments).toEqual([{ id: 'c', itemId: 'i', body: 'Oi', ...by }])
    expect(after(create, { type: 'comment.delete', commentId: 'c' }).comments).toEqual([])
  })
  test('a booking keeps what it had when one part changes', () => {
    const set = (fields: object) => ({ type: 'item.booking', itemId: 'i', fields }) as Operation
    expect(after(set({ code: 'ABC' }), set({ details: 'Balcão 3' })).bookings).toEqual([
      { itemId: 'i', code: 'ABC', details: 'Balcão 3' },
    ])
  })
  test('tasks are added, changed and removed', () => {
    const create: Operation = { type: 'task.create', taskId: 't', list: 'pack', title: 'Adaptador' }
    const update: Operation = {
      type: 'task.update',
      taskId: 't',
      fields: { done: true, assigneeId: 'bob' },
    }
    expect(after(create, update).tasks).toEqual([
      { id: 't', list: 'pack', title: 'Adaptador', done: true, assigneeId: 'bob' },
    ])
    expect(after(create, { type: 'task.delete', taskId: 't' }).tasks).toEqual([])
  })
  test('expenses are added, changed and removed', () => {
    const { id: expenseId, ...fields } = expense()
    const create: Operation = { type: 'expense.create', expenseId, fields }
    const update: Operation = { type: 'expense.update', expenseId, fields: { amount: 5 } }
    expect(after(create, update).expenses).toEqual([expense({ amount: 5 })])
    expect(after(create, { type: 'expense.delete', expenseId }).expenses).toEqual([])
  })
  test('an attachment can be removed', () => {
    const kept = { ...emptyGroup(), attachments: [{ id: 'f' }] } as never
    const next = applyLocally(trip(kept), { type: 'attachment.delete', attachmentId: 'f' }, by)
    expect(next.group?.attachments).toEqual([])
  })
  test('none of it exists for who only looks', () => {
    const guest = { ...trip(), group: null } as Trip
    expect(applyLocally(guest, { type: 'item.vote', itemId: 'i', on: true }, by).group).toBeNull()
  })
})

describe('what others hear', () => {
  const entry = (op: LogEntry['op'], over = {}): LogEntry => ({
    revision: 2,
    opId: 'o',
    userId: 'bob',
    userName: 'Bob',
    at: by.at,
    op,
    ...over,
  })
  const comment = entry({ type: 'comment.create', commentId: 'c', itemId: 'i', body: 'segredo' })
  test('comes with the name of whoever did it', () => {
    const next = applyEntry(trip(), comment)!
    expect(next.group?.people).toEqual({ bob: 'Bob' })
    expect(next.group?.comments[0]).toMatchObject({ userId: 'bob', at: by.at })
    expect(next.revision).toBe(2)
  })
  test('a file someone added', () => {
    const attachment = {
      id: 'f',
      itemId: 'i',
      name: 'a.pdf',
      type: 'application/pdf',
      size: 3,
      userId: 'bob',
    }
    const next = applyEntry(trip(), entry({ type: 'attachment.added', itemId: 'i', attachment }))
    expect(next?.group?.attachments).toEqual([attachment])
  })
  test('is only a number for who only looks', () => {
    const hidden = forViewer(comment)
    expect(JSON.stringify(hidden)).not.toMatch(/segredo|bob|Bob/)
    const guest = { ...trip(), group: null } as Trip
    expect(applyEntry(guest, hidden)).toEqual({ ...guest, revision: 2 })
  })
  test('someone who should know more loads the trip again', () => {
    expect(applyEntry(trip(), forViewer(comment))).toBeNull()
  })
  test('the itinerary is no secret', () => {
    const move = entry({ type: 'item.delete', itemId: 'i' })
    expect(forViewer(move)).toBe(move)
  })
})

describe('who owes whom', () => {
  test('a split loses no cent', () => {
    const shares = sharesOf({ amount: 100, split: ['cris', 'ana', 'bob'] })
    expect(shares).toEqual(
      new Map([
        ['ana', 34],
        ['bob', 33],
        ['cris', 33],
      ]),
    )
  })
  test('who paid is paid back by the others', () => {
    expect(settlements([expense({ amount: 9000 })])).toEqual([
      { currency: 'BRL', from: 'bob', to: 'ana', amount: 3000 },
      { currency: 'BRL', from: 'cris', to: 'ana', amount: 3000 },
    ])
  })
  test('debts that cancel out disappear', () => {
    const pair = { split: ['ana', 'bob'], amount: 1000 }
    expect(settlements([expense(pair), expense({ ...pair, paidBy: 'bob' })])).toEqual([])
  })
  test('takes one transfer less than people, at most', () => {
    const split = ['ana', 'bob', 'cris', 'duda']
    const all = settlements([
      expense({ split, amount: 4000 }),
      expense({ split, amount: 1200, paidBy: 'bob' }),
      expense({ split, amount: 377, paidBy: 'cris' }),
    ])
    expect(all.length).toBeLessThanOrEqual(3)
    expect(all.every((s) => s.amount > 0)).toBe(true)
  })
  test('a payment settles a debt', () => {
    expect(
      settlements([
        expense({ amount: 1000, split: ['ana', 'bob'] }),
        expense({ amount: 500, paidBy: 'bob', split: ['ana'], payment: true }),
      ]),
    ).toEqual([])
  })
  test('currencies never mix', () => {
    const usd = expense({ currency: 'USD', amount: 600, split: ['ana', 'bob'] })
    expect(settlements([expense({ amount: 9000, split: ['bob'] }), usd])).toEqual([
      { currency: 'BRL', from: 'bob', to: 'ana', amount: 9000 },
      { currency: 'USD', from: 'bob', to: 'ana', amount: 300 },
    ])
  })
})

describe('what is accepted', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const { id: _, ...fields } = expense()
  const ok = (op: object) => operationSchema.safeParse(op).success
  test.each([
    [true, {}],
    [false, { amount: 0 }],
    [false, { amount: 1.5 }],
    [false, { amount: 1e12 }],
    [false, { currency: 'reais' }],
    [false, { split: [] }],
    [false, { split: ['ana', 'ana'] }],
    [false, { date: '2027-02-30' }],
    [false, { title: ' ' }],
  ])('%s for an expense with %o', (expected, over) => {
    expect(ok({ type: 'expense.create', expenseId: id, fields: { ...fields, ...over } })).toBe(
      expected,
    )
  })
  test('a comment has something to say', () => {
    const comment = (body: string) =>
      ok({ type: 'comment.create', commentId: id, itemId: id, body })
    expect([comment('Oi'), comment('  '), comment('x'.repeat(2001))]).toEqual([true, false, false])
  })
  test('a file can only be added by uploading it', () => {
    expect(ok({ type: 'attachment.added', itemId: id, attachment: {} })).toBe(false)
    expect(ok({ type: 'group.hidden' })).toBe(false)
  })
})
