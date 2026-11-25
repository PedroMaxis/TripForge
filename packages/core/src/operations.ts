import { z } from 'zod'
import { isDate } from './dates'
import { itemKinds } from './domain'
import { taskLists } from './group'
import { isPosition } from './position'
import { arePaired, coordinates, tripFields, tripPlaceFields } from './trip'

const id = z.uuid()
const position = z.string().refine(isPosition)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()

const notEmpty = (fields: object) => Object.values(fields).some((v) => v !== undefined)

const itemFields = {
  title: z.string().trim().min(1).max(200),
  kind: z.enum(itemKinds),
  startTime: time.nullable(),
  endTime: time.nullable(),
  placeName: text(200),
  address: text(300),
  ...coordinates,
  osmRef: text(40),
  notes: text(5000),
  done: z.boolean(),
}

const personId = z.string().min(1).max(64)
const expenseFields = {
  title: itemFields.title,
  amount: z.int().positive().max(100_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paidBy: personId,
  split: z
    .array(personId)
    .min(1)
    .max(100)
    .refine((list) => new Set(list).size === list.length),
  date: z.string().refine(isDate),
  payment: z.boolean(),
}

export const operationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('trip.update'),
    fields: z
      .strictObject({ ...tripFields, ...tripPlaceFields, archived: z.boolean() })
      .partial()
      .refine((f) => arePaired(f.destinationLat, f.destinationLng))
      .refine(notEmpty),
  }),
  z.strictObject({
    type: z.literal('day.update'),
    dayId: id,
    fields: z
      .strictObject({ title: text(120), notes: text(5000) })
      .partial()
      .refine(notEmpty),
  }),
  z.strictObject({
    type: z.literal('day.order'),
    dayId: id,
    items: z
      .array(z.strictObject({ itemId: id, position }))
      .min(1)
      .max(200)
      .refine((list) => new Set(list.map((i) => i.itemId)).size === list.length),
  }),
  z.strictObject({
    type: z.literal('item.create'),
    itemId: id,
    dayId: id.nullable(),
    position,
    title: itemFields.title,
    kind: itemFields.kind,
    place: z
      .strictObject({
        placeName: itemFields.placeName,
        address: itemFields.address,
        lat: coordinates.lat.unwrap(),
        lng: coordinates.lng.unwrap(),
        osmRef: itemFields.osmRef,
      })
      .optional(),
  }),
  z.strictObject({
    type: z.literal('item.update'),
    itemId: id,
    baseVersion: z.int().positive(),
    fields: z
      .strictObject(itemFields)
      .partial()
      .refine((f) => arePaired(f.lat, f.lng))
      .refine(notEmpty),
  }),
  z.strictObject({ type: z.literal('item.move'), itemId: id, dayId: id.nullable(), position }),
  z.strictObject({ type: z.literal('item.delete'), itemId: id }),
  z.strictObject({ type: z.literal('item.restore'), itemId: id }),
  z.strictObject({ type: z.literal('item.vote'), itemId: id, on: z.boolean() }),
  z.strictObject({
    type: z.literal('item.booking'),
    itemId: id,
    fields: z
      .strictObject({ code: text(120), details: text(2000) })
      .partial()
      .refine(notEmpty),
  }),
  z.strictObject({
    type: z.literal('comment.create'),
    commentId: id,
    itemId: id,
    body: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({ type: z.literal('comment.delete'), commentId: id }),
  z.strictObject({ type: z.literal('attachment.delete'), attachmentId: id }),
  z.strictObject({
    type: z.literal('task.create'),
    taskId: id,
    list: z.enum(taskLists),
    title: itemFields.title,
  }),
  z.strictObject({
    type: z.literal('task.update'),
    taskId: id,
    fields: z
      .strictObject({
        title: itemFields.title,
        done: z.boolean(),
        assigneeId: personId.nullable(),
      })
      .partial()
      .refine(notEmpty),
  }),
  z.strictObject({ type: z.literal('task.delete'), taskId: id }),
  z.strictObject({
    type: z.literal('expense.create'),
    expenseId: id,
    fields: z.strictObject(expenseFields),
  }),
  z.strictObject({
    type: z.literal('expense.update'),
    expenseId: id,
    fields: z.strictObject(expenseFields).partial().refine(notEmpty),
  }),
  z.strictObject({ type: z.literal('expense.delete'), expenseId: id }),
])

export type Operation = z.infer<typeof operationSchema>

export const operationRequestSchema = z.strictObject({
  opId: id,
  op: operationSchema,
  /** Made while there was no connection, so it may be older than it looks. */
  queued: z.boolean().optional(),
})
export type OperationRequest = z.infer<typeof operationRequestSchema>

export const operationErrors = ['forbidden', 'not_found', 'deleted', 'invalid'] as const
export type OperationErrorCode = (typeof operationErrors)[number]
