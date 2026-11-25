import type { Attachment, GroupOperation, TripGroup } from '@tripforge/core'
import { and, asc, eq, getTableColumns, inArray, or, sql } from 'drizzle-orm'
import { findLiveItem, lockForChange, OperationError, pastResult, record, type Tx } from './change'
import type { AnyDb } from './client'
import {
  attachments,
  bookings,
  comments,
  expenses,
  items,
  itemVotes,
  tasks,
  tripMembers,
  type trips,
  users,
} from './schema'

type TripRow = typeof trips.$inferSelect

const { data: _, createdAt: __, tripId: ___, ...attachmentColumns } = getTableColumns(attachments)

/** What only the people who plan the trip see. */
export async function loadGroup(db: AnyDb, tripId: string): Promise<TripGroup> {
  const here = eq(items.tripId, tripId)
  const votes = await db
    .select({ itemId: itemVotes.itemId, userId: itemVotes.userId })
    .from(itemVotes)
    .innerJoin(items, eq(items.id, itemVotes.itemId))
    .where(here)
  const said = await db
    .select({ comment: comments })
    .from(comments)
    .innerJoin(items, eq(items.id, comments.itemId))
    .where(here)
    .orderBy(asc(comments.createdAt), asc(comments.id))
  const booked = await db
    .select({ booking: bookings })
    .from(bookings)
    .innerJoin(items, eq(items.id, bookings.itemId))
    .where(here)
  const files = await db
    .select(attachmentColumns)
    .from(attachments)
    .where(eq(attachments.tripId, tripId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id))
  const todo = await db
    .select()
    .from(tasks)
    .where(eq(tasks.tripId, tripId))
    .orderBy(asc(tasks.createdAt), asc(tasks.id))
  const spent = await db
    .select()
    .from(expenses)
    .where(eq(expenses.tripId, tripId))
    .orderBy(asc(expenses.createdAt), asc(expenses.id))

  const named = new Set([
    ...said.map((c) => c.comment.userId),
    ...files.map((f) => f.userId),
    ...todo.flatMap((t) => t.assigneeId ?? []),
    ...spent.flatMap((e) => [e.paidBy, ...e.split]),
  ])
  const members = db
    .select({ id: tripMembers.userId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId))
  const names = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(or(inArray(users.id, members), inArray(users.id, [...named])))

  return {
    people: Object.fromEntries(names.map((p) => [p.id, p.name])),
    votes,
    comments: said.map(({ comment: { createdAt, ...c } }) => ({
      ...c,
      at: createdAt.toISOString(),
    })),
    bookings: booked.map((b) => b.booking),
    attachments: files,
    tasks: todo.map(({ tripId: _, createdAt: __, ...task }) => task),
    expenses: spent.map(({ tripId: _, createdAt: __, ...expense }) => expense),
  }
}

/** Everyone named has to be on the trip, or to have been part of it already. */
async function requirePeople(tx: Tx, tripId: string, ids: string[], already: string[] = []) {
  const others = [...new Set(ids)].filter((id) => !already.includes(id))
  if (others.length === 0) return
  const found = await tx
    .select({ id: tripMembers.userId })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), inArray(tripMembers.userId, others)))
  if (found.length < others.length) throw new OperationError('invalid')
}

async function requireFree(
  tx: Tx,
  table: typeof tasks | typeof expenses | typeof comments,
  id: string,
) {
  const [taken] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id))
  if (taken) throw new OperationError('invalid')
}

async function findExpense(tx: Tx, tripId: string, id: string) {
  const [found] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)))
  if (!found) throw new OperationError('not_found')
  return found
}

async function findTask(tx: Tx, tripId: string, id: string) {
  const [found] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.tripId, tripId)))
  if (!found) throw new OperationError('not_found')
}

export async function runInGroup(tx: Tx, userId: string, trip: TripRow, op: GroupOperation) {
  const tripId = trip.id
  switch (op.type) {
    case 'item.vote': {
      const { id: itemId } = await findLiveItem(tx, tripId, op.itemId)
      if (op.on) {
        await tx.insert(itemVotes).values({ itemId, userId }).onConflictDoNothing()
      } else {
        await tx
          .delete(itemVotes)
          .where(and(eq(itemVotes.itemId, itemId), eq(itemVotes.userId, userId)))
      }
      return
    }
    case 'item.booking': {
      const { id: itemId } = await findLiveItem(tx, tripId, op.itemId)
      await tx
        .insert(bookings)
        .values({ itemId, ...op.fields })
        .onConflictDoUpdate({ target: bookings.itemId, set: op.fields })
      return
    }
    case 'comment.create': {
      const { id: itemId } = await findLiveItem(tx, tripId, op.itemId)
      await requireFree(tx, comments, op.commentId)
      await tx.insert(comments).values({ id: op.commentId, itemId, userId, body: op.body })
      return
    }
    case 'comment.delete': {
      const [found] = await tx
        .select({ userId: comments.userId })
        .from(comments)
        .innerJoin(items, eq(items.id, comments.itemId))
        .where(and(eq(comments.id, op.commentId), eq(items.tripId, tripId)))
      if (!found) throw new OperationError('not_found')
      if (found.userId !== userId && trip.ownerId !== userId) throw new OperationError('forbidden')
      await tx.delete(comments).where(eq(comments.id, op.commentId))
      return
    }
    case 'attachment.delete': {
      const [gone] = await tx
        .delete(attachments)
        .where(and(eq(attachments.id, op.attachmentId), eq(attachments.tripId, tripId)))
        .returning({ id: attachments.id })
      if (!gone) throw new OperationError('not_found')
      return
    }
    case 'task.create':
      await requireFree(tx, tasks, op.taskId)
      await tx.insert(tasks).values({ id: op.taskId, tripId, list: op.list, title: op.title })
      return
    case 'task.update':
      await findTask(tx, tripId, op.taskId)
      if (op.fields.assigneeId) await requirePeople(tx, tripId, [op.fields.assigneeId])
      await tx.update(tasks).set(op.fields).where(eq(tasks.id, op.taskId))
      return
    case 'task.delete':
      await findTask(tx, tripId, op.taskId)
      await tx.delete(tasks).where(eq(tasks.id, op.taskId))
      return
    case 'expense.create':
      await requireFree(tx, expenses, op.expenseId)
      await requirePeople(tx, tripId, [op.fields.paidBy, ...op.fields.split])
      await tx.insert(expenses).values({ id: op.expenseId, tripId, ...op.fields })
      return
    case 'expense.update': {
      const known = await findExpense(tx, tripId, op.expenseId)
      const { paidBy, split } = { ...known, ...op.fields }
      await requirePeople(tx, tripId, [paidBy, ...split], [known.paidBy, ...known.split])
      await tx.update(expenses).set(op.fields).where(eq(expenses.id, known.id))
      return
    }
    case 'expense.delete':
      await findExpense(tx, tripId, op.expenseId)
      await tx.delete(expenses).where(eq(expenses.id, op.expenseId))
      return
  }
}

// --- Files -------------------------------------------------------------------

const mb = 1024 * 1024
/** In bytes. They live in the database, so that a backup has everything. */
export const attachmentLimits = { file: 5 * mb, trip: 40 * mb, person: 100 * mb }

export class AttachmentError extends Error {
  constructor(readonly code: 'bad_type' | 'too_large' | 'full') {
    super(code)
  }
}

const startsWith = (data: Uint8Array, text: string, at = 0) =>
  Buffer.from(data.subarray(at, at + text.length)).toString('latin1') === text

/** What a file is, going by its first bytes. */
function typeOf(data: Uint8Array) {
  if (startsWith(data, '%PDF-')) return 'application/pdf'
  if (startsWith(data, '\x89PNG\r\n\x1a\n')) return 'image/png'
  if (startsWith(data, '\xff\xd8\xff')) return 'image/jpeg'
  if (startsWith(data, 'RIFF') && startsWith(data, 'WEBP', 8)) return 'image/webp'
  throw new AttachmentError('bad_type')
}

export async function addAttachment(
  db: AnyDb,
  upload: {
    userId: string
    tripId: string
    itemId: string
    opId: string
    name: string
    data: Uint8Array
  },
): Promise<{ attachment: Attachment; revision: number }> {
  const { userId, tripId, opId, name, data } = upload
  if (data.length > attachmentLimits.file) throw new AttachmentError('too_large')
  const type = typeOf(data)
  return db.transaction(async (tx) => {
    const trip = await lockForChange(tx, userId, tripId)
    const done = await pastResult(tx, upload)
    if (done) {
      const { attachment } = done.op as { attachment: Attachment }
      return { attachment, revision: done.result.revision }
    }
    const { id: itemId } = await findLiveItem(tx, tripId, upload.itemId)
    const total = sql<number>`coalesce(sum(${attachments.size}), 0)::float8`
    const [used] = await tx
      .select({ total })
      .from(attachments)
      .where(eq(attachments.tripId, tripId))
    const [own] = await tx.select({ total }).from(attachments).where(eq(attachments.userId, userId))
    if (
      used!.total + data.length > attachmentLimits.trip ||
      own!.total + data.length > attachmentLimits.person
    ) {
      throw new AttachmentError('full')
    }
    const [attachment] = await tx
      .insert(attachments)
      .values({ tripId, itemId, userId, name, type, size: data.length, data })
      .returning(attachmentColumns)
    const revision = trip.revision + 1
    await record(tx, {
      tripId,
      revision,
      opId,
      userId,
      action: 'attachment.added',
      itemId,
      payload: {
        op: { type: 'attachment.added', itemId, attachment: attachment! },
        result: { revision },
      },
    })
    return { attachment: attachment!, revision }
  })
}

/** A file, for someone who plans the trip. */
export async function getAttachment(db: AnyDb, userId: string, tripId: string, id: string) {
  const [found] = await db
    .select({ name: attachments.name, type: attachments.type, data: attachments.data })
    .from(attachments)
    .innerJoin(
      tripMembers,
      and(
        eq(tripMembers.tripId, attachments.tripId),
        eq(tripMembers.userId, userId),
        inArray(tripMembers.role, ['owner', 'editor']),
      ),
    )
    .where(and(eq(attachments.id, id), eq(attachments.tripId, tripId)))
  return found ?? null
}
