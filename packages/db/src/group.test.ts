import { randomUUID } from 'node:crypto'
import type { Expense, Operation } from '@tripforge/core'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { addAttachment, attachmentLimits, getAttachment } from './group'
import { attachments, tripMembers, users } from './index'
import { entriesSince, getLog, recentLog } from './log'
import { changeMember, createInvite, getSharedTrip } from './members'
import { applyOperation } from './operations'
import { createTestDb, type TestDb } from './testing'
import { createTrip, duplicateTrip, getTrip } from './trips'

let t: TestDb
let tripId: string
let itemId: string
beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())
beforeEach(async () => {
  await t.reset()
  await t.db.insert(users).values(
    ['owner', 'ana', 'viewer', 'stranger'].map((id) => ({
      id,
      name: id.toUpperCase(),
      email: `${id}@example.com`,
    })),
  )
  tripId = await newTrip()
  await t.db.insert(tripMembers).values([
    { tripId, userId: 'ana', role: 'editor' },
    { tripId, userId: 'viewer', role: 'viewer' },
  ])
  itemId = await addItem(tripId)
})
const newTrip = () =>
  createTrip(t.db, 'owner', {
    title: 'BH',
    destination: 'BH',
    startDate: '2027-03-04',
    endDate: '2027-03-05',
    timezone: 'UTC',
  })
const apply = (op: Operation, userId = 'owner', id = tripId) =>
  applyOperation(t.db, { userId, tripId: id, opId: randomUUID(), op })
async function addItem(id: string) {
  const newId = randomUUID()
  const dayId = (await getTrip(t.db, 'owner', id))!.days[0]!.id
  await apply(
    { type: 'item.create', itemId: newId, dayId, position: 'a0', title: 'Museu', kind: 'other' },
    'owner',
    id,
  )
  return newId
}
const group = async (userId = 'owner') => (await getTrip(t.db, userId, tripId))!.group!
const code = (c: string) => ({ code: c })
const expense = (over: Partial<Expense> = {}) => ({
  type: 'expense.create' as const,
  expenseId: randomUUID(),
  fields: {
    title: 'Airbnb',
    amount: 90_000,
    currency: 'BRL',
    paidBy: 'owner',
    split: ['owner', 'ana'],
    date: '2027-03-04',
    payment: false,
    ...over,
  },
})
const pdf = (size = 10) => {
  const data = Buffer.alloc(size)
  data.write('%PDF-1.7')
  return data
}
const upload = (over: object = {}, userId = 'ana') =>
  addAttachment(t.db, {
    userId,
    tripId,
    itemId,
    opId: randomUUID(),
    name: 'Passagem.pdf',
    data: pdf(),
    ...over,
  })

describe('what the group keeps', () => {
  test('votes, once per person', async () => {
    await apply({ type: 'item.vote', itemId, on: true })
    await apply({ type: 'item.vote', itemId, on: true })
    await apply({ type: 'item.vote', itemId, on: true }, 'ana')
    expect((await group()).votes).toHaveLength(2)
    await apply({ type: 'item.vote', itemId, on: false })
    expect((await group()).votes).toEqual([{ itemId, userId: 'ana' }])
  })
  test('comments, which only their author or the owner removes', async () => {
    const say = async (userId: string) => {
      const commentId = randomUUID()
      await apply({ type: 'comment.create', commentId, itemId, body: 'Oi' }, userId)
      return commentId
    }
    const [first, second] = [await say('owner'), await say('ana')]
    expect((await group('ana')).comments).toMatchObject([
      { id: first, itemId, userId: 'owner', body: 'Oi' },
      { id: second, userId: 'ana' },
    ])
    const remove = (commentId: string, userId: string) =>
      apply({ type: 'comment.delete', commentId }, userId)
    await expect(remove(first, 'ana')).rejects.toMatchObject(code('forbidden'))
    await remove(second, 'owner')
    await remove(first, 'owner')
    expect((await group()).comments).toEqual([])
  })
  test('a booking, part by part', async () => {
    await apply({ type: 'item.booking', itemId, fields: { code: 'ABC123' } })
    await apply({ type: 'item.booking', itemId, fields: { details: 'Balcão 3' } }, 'ana')
    expect((await group()).bookings).toEqual([{ itemId, code: 'ABC123', details: 'Balcão 3' }])
  })
  test('tasks, in the order they came', async () => {
    const [a, b] = [randomUUID(), randomUUID()]
    await apply({ type: 'task.create', taskId: a, list: 'todo', title: 'Passaporte' })
    await apply({ type: 'task.create', taskId: b, list: 'pack', title: 'Adaptador' })
    await apply({ type: 'task.update', taskId: a, fields: { done: true, assigneeId: 'ana' } })
    expect((await group()).tasks).toEqual([
      { id: a, list: 'todo', title: 'Passaporte', done: true, assigneeId: 'ana' },
      { id: b, list: 'pack', title: 'Adaptador', done: false, assigneeId: null },
    ])
    await expect(
      apply({ type: 'task.update', taskId: a, fields: { assigneeId: 'stranger' } }),
    ).rejects.toMatchObject(code('invalid'))
    await apply({ type: 'task.delete', taskId: a })
    expect((await group()).tasks).toHaveLength(1)
  })
  test('expenses, among people of the trip', async () => {
    const op = expense()
    await apply(op)
    await apply({ type: 'expense.update', expenseId: op.expenseId, fields: { amount: 5000 } })
    expect((await group()).expenses).toEqual([{ id: op.expenseId, ...op.fields, amount: 5000 }])
    for (const over of [{ paidBy: 'stranger' }, { split: ['owner', 'stranger'] }])
      await expect(apply(expense(over))).rejects.toMatchObject(code('invalid'))
    await apply({ type: 'expense.delete', expenseId: op.expenseId })
    expect((await group()).expenses).toEqual([])
    await apply(op)
    expect((await group()).expenses).toHaveLength(1)
  })
  test('someone who left is still part of what was spent', async () => {
    const op = expense()
    await apply(op)
    await changeMember(t.db, 'owner', tripId, 'ana', null)
    expect((await group()).people).toMatchObject({ owner: 'OWNER', ana: 'ANA' })
    await apply({
      type: 'expense.update',
      expenseId: op.expenseId,
      fields: { split: ['ana'], title: 'Hotel' },
    })
    await expect(apply(expense())).rejects.toMatchObject(code('invalid'))
  })
  test('files', async () => {
    const { attachment, revision } = await upload()
    expect(attachment).toMatchObject({
      itemId,
      userId: 'ana',
      name: 'Passagem.pdf',
      type: 'application/pdf',
      size: 10,
    })
    expect((await group()).attachments).toEqual([attachment])
    expect((await getTrip(t.db, 'owner', tripId))!.revision).toBe(revision)
    const found = await getAttachment(t.db, 'owner', tripId, attachment.id)
    expect(found).toMatchObject({ name: 'Passagem.pdf', type: 'application/pdf' })
    expect(Buffer.from(found!.data).equals(pdf())).toBe(true)
    await apply({ type: 'attachment.delete', attachmentId: attachment.id })
    expect((await group()).attachments).toEqual([])
    expect(await getAttachment(t.db, 'owner', tripId, attachment.id)).toBeNull()
  })
})

describe('files that are refused', () => {
  test('what they say they are does not count, only what they are', async () => {
    const html = Buffer.from('<script>alert(1)</script>')
    await expect(upload({ data: html })).rejects.toMatchObject(code('bad_type'))
  })
  test.each([
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/webp', [...Buffer.from('RIFF0000WEBP')]],
  ])('%s is fine', async (type, bytes) => {
    expect((await upload({ data: Buffer.from(bytes) })).attachment.type).toBe(type)
  })
  test('too large, or empty', async () => {
    const data = pdf(attachmentLimits.file + 1)
    await expect(upload({ data })).rejects.toMatchObject(code('too_large'))
    await expect(upload({ data: Buffer.alloc(0) })).rejects.toMatchObject(code('bad_type'))
  })
  test('when the trip is full', async () => {
    await t.db.insert(attachments).values({
      tripId,
      itemId,
      userId: 'owner',
      name: 'x',
      type: 'image/png',
      size: attachmentLimits.trip - 5,
      data: Buffer.from('x'),
    })
    await expect(upload()).rejects.toMatchObject(code('full'))
  })
  test('on a stop of another trip, or one that is gone', async () => {
    const foreign = await addItem(await newTrip())
    await expect(upload({ itemId: foreign })).rejects.toMatchObject(code('not_found'))
    await apply({ type: 'item.delete', itemId })
    await expect(upload()).rejects.toMatchObject(code('deleted'))
  })
  test('the same upload twice is one file', async () => {
    const opId = randomUUID()
    const first = await upload({ opId })
    expect(await upload({ opId })).toEqual(first)
    expect((await group()).attachments).toHaveLength(1)
  })
})

describe('is only for who plans the trip', () => {
  const secret = /Airbnb|segredo|ABC123|Passagem|Adaptador/
  beforeEach(async () => {
    await apply(expense())
    await apply({ type: 'comment.create', commentId: randomUUID(), itemId, body: 'segredo' })
    await apply({ type: 'item.booking', itemId, fields: { code: 'ABC123' } })
    await apply({ type: 'task.create', taskId: randomUUID(), list: 'pack', title: 'Adaptador' })
    await upload()
  })
  test('a viewer gets the trip without it', async () => {
    const trip = await getTrip(t.db, 'viewer', tripId)
    expect(trip?.group).toBeNull()
    expect(JSON.stringify(trip)).not.toMatch(secret)
  })
  test('so does a view link', async () => {
    const { token } = await createInvite(t.db, 'owner', tripId, 'viewer')
    const shared = await getSharedTrip(t.db, token)
    expect(shared).toMatchObject({ status: 'ok', trip: { group: null } })
    expect(JSON.stringify(shared)).not.toMatch(secret)
  })
  test('nor does the log tell a viewer, though no revision is missing', async () => {
    const log = await getLog(t.db, 'viewer', tripId, 0)
    expect(log!.entries.map((e) => e.revision)).toEqual([1, 2, 3, 4, 5, 6])
    expect(JSON.stringify(log)).not.toMatch(secret)
    expect(JSON.stringify(await recentLog(t.db, 'viewer', tripId))).not.toMatch(secret)
    expect(JSON.stringify(await getLog(t.db, 'ana', tripId, 0))).toMatch(secret)
    expect(await entriesSince(t.db, tripId, 0)).toHaveLength(6)
  })
  test('a viewer changes nothing and opens no file', async () => {
    await expect(apply({ type: 'item.vote', itemId, on: true }, 'viewer')).rejects.toMatchObject(
      code('forbidden'),
    )
    await expect(upload({}, 'viewer')).rejects.toMatchObject(code('forbidden'))
    const [file] = (await group()).attachments
    for (const person of ['viewer', 'stranger'])
      expect(await getAttachment(t.db, person, tripId, file!.id)).toBeNull()
  })
  test('nothing of another trip can be touched', async () => {
    const other = await newTrip()
    const { tasks, expenses, comments, attachments: files } = await group()
    const ops: Operation[] = [
      { type: 'item.vote', itemId, on: true },
      { type: 'item.booking', itemId, fields: { code: 'X' } },
      { type: 'comment.create', commentId: randomUUID(), itemId, body: 'x' },
      { type: 'comment.delete', commentId: comments[0]!.id },
      { type: 'task.update', taskId: tasks[0]!.id, fields: { done: true } },
      { type: 'task.delete', taskId: tasks[0]!.id },
      { type: 'expense.update', expenseId: expenses[0]!.id, fields: { amount: 1 } },
      { type: 'expense.delete', expenseId: expenses[0]!.id },
      { type: 'attachment.delete', attachmentId: files[0]!.id },
    ]
    for (const op of ops)
      await expect(apply(op, 'owner', other)).rejects.toMatchObject(code('not_found'))
    const taken: Operation[] = [
      { type: 'task.create', taskId: tasks[0]!.id, list: 'todo', title: 'x' },
      { ...expense({ split: ['owner'] }), expenseId: expenses[0]!.id },
    ]
    for (const op of taken)
      await expect(apply(op, 'owner', other)).rejects.toMatchObject(code('invalid'))
  })
  test('a copy of the trip starts without it', async () => {
    const copyId = await duplicateTrip(t.db, 'ana', tripId, {
      title: 'Cópia',
      startDate: '2028-01-01',
    })
    const copy = await getTrip(t.db, 'ana', copyId!)
    expect(copy?.group).toMatchObject({ expenses: [], comments: [], tasks: [], attachments: [] })
  })
})
