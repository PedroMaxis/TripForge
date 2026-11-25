import type { Operation } from './operations'

export type Vote = { itemId: string; userId: string }
export type Comment = { id: string; itemId: string; userId: string; body: string; at: string }
export type Booking = { itemId: string; code: string | null; details: string | null }
export type Attachment = {
  id: string
  itemId: string
  userId: string
  name: string
  type: string
  size: number
}
export const taskLists = ['todo', 'pack'] as const
export type TaskList = (typeof taskLists)[number]
export type Task = {
  id: string
  list: TaskList
  title: string
  done: boolean
  assigneeId: string | null
}
export type Expense = {
  id: string
  title: string
  /** In the smallest unit of the currency, such as cents. */
  amount: number
  currency: string
  paidBy: string
  /** Who it was for, in equal parts. */
  split: string[]
  date: string
  /** Money handed from one person to another, to settle up. */
  payment: boolean
}

/** What only the people who plan the trip see, and nobody with a view link. */
export type TripGroup = {
  /** Names by id, also of people who left but are still part of what was spent or said. */
  people: Record<string, string>
  votes: Vote[]
  comments: Comment[]
  bookings: Booking[]
  attachments: Attachment[]
  tasks: Task[]
  expenses: Expense[]
}

export const emptyGroup = (): TripGroup => ({
  people: {},
  votes: [],
  comments: [],
  bookings: [],
  attachments: [],
  tasks: [],
  expenses: [],
})

export const groupOperationTypes = [
  'item.vote',
  'item.booking',
  'comment.create',
  'comment.delete',
  'attachment.delete',
  'task.create',
  'task.update',
  'task.delete',
  'expense.create',
  'expense.update',
  'expense.delete',
] as const
export type GroupOperation = Extract<Operation, { type: (typeof groupOperationTypes)[number] }>

export const isGroupOperation = (op: { type: string }): op is GroupOperation =>
  (groupOperationTypes as readonly string[]).includes(op.type)

/** Who did something, and when. */
export type Author = { userId: string; at: string }

const defined = <T extends object>(fields: T) =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<T>
const without = <T extends { id: string }>(list: T[], id: string) => list.filter((x) => x.id !== id)
const changed = <T extends { id: string }>(list: T[], id: string, fields: object) =>
  list.map((x) => (x.id === id ? { ...x, ...defined(fields) } : x))

export function applyToGroup(group: TripGroup, op: GroupOperation, by: Author): TripGroup {
  switch (op.type) {
    case 'item.vote': {
      const { itemId, on } = op
      const { userId } = by
      const others = group.votes.filter((v) => v.itemId !== itemId || v.userId !== userId)
      return { ...group, votes: on ? [...others, { itemId, userId }] : others }
    }
    case 'item.booking': {
      const { itemId } = op
      const known = group.bookings.find((b) => b.itemId === itemId)
      const next = { ...(known ?? { itemId, code: null, details: null }), ...defined(op.fields) }
      return { ...group, bookings: [...group.bookings.filter((b) => b !== known), next] }
    }
    case 'comment.create': {
      const comment = { id: op.commentId, itemId: op.itemId, body: op.body, ...by }
      return { ...group, comments: [...without(group.comments, comment.id), comment] }
    }
    case 'comment.delete':
      return { ...group, comments: without(group.comments, op.commentId) }
    case 'attachment.delete':
      return { ...group, attachments: without(group.attachments, op.attachmentId) }
    case 'task.create': {
      const task = { id: op.taskId, list: op.list, title: op.title, done: false, assigneeId: null }
      return { ...group, tasks: [...without(group.tasks, task.id), task] }
    }
    case 'task.update':
      return { ...group, tasks: changed(group.tasks, op.taskId, op.fields) }
    case 'task.delete':
      return { ...group, tasks: without(group.tasks, op.taskId) }
    case 'expense.create': {
      const expense = { id: op.expenseId, ...op.fields }
      return { ...group, expenses: [...without(group.expenses, expense.id), expense] }
    }
    case 'expense.update':
      return { ...group, expenses: changed(group.expenses, op.expenseId, op.fields) }
    case 'expense.delete':
      return { ...group, expenses: without(group.expenses, op.expenseId) }
  }
}

/** Equal parts, to the last cent: the first ones, always in the same order, get what is left. */
export function sharesOf({ amount, split }: Pick<Expense, 'amount' | 'split'>) {
  const people = [...split].sort()
  const part = Math.floor(amount / people.length)
  const left = amount - part * people.length
  return new Map(people.map((id, i) => [id, part + (i < left ? 1 : 0)]))
}

/** For each currency, what each person is owed (positive) or owes (negative). */
export function balances(expenses: Expense[]) {
  const all = new Map<string, Map<string, number>>()
  for (const expense of expenses) {
    const currency = all.get(expense.currency) ?? new Map<string, number>()
    all.set(expense.currency, currency)
    const add = (id: string, amount: number) => currency.set(id, (currency.get(id) ?? 0) + amount)
    add(expense.paidBy, expense.amount)
    for (const [id, share] of sharesOf(expense)) add(id, -share)
  }
  return all
}

export type Settlement = { currency: string; from: string; to: string; amount: number }

/** Few transfers that settle everything: the largest debt pays the largest credit, and again. */
export function settlements(expenses: Expense[]): Settlement[] {
  const result: Settlement[] = []
  for (const [currency, people] of [...balances(expenses)].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const left = [...people].map(([id, amount]) => ({ id, amount }))
    for (;;) {
      left.sort((a, b) => b.amount - a.amount || (a.id < b.id ? -1 : 1))
      const to = left[0]
      const from = left.filter((p) => p.amount === left.at(-1)?.amount)[0]
      if (!to || !from || to.amount <= 0) break
      const amount = Math.min(to.amount, -from.amount)
      to.amount -= amount
      from.amount += amount
      result.push({ currency, from: from.id, to: to.id, amount })
    }
  }
  return result
}
