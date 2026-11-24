import { z } from 'zod'
import { itemKinds } from './domain'
import { isPosition } from './position'
import { tripFields } from './trip'

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
  notes: text(5000),
}

export const operationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('trip.update'),
    fields: z
      .strictObject({ ...tripFields, archived: z.boolean() })
      .partial()
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
    type: z.literal('item.create'),
    itemId: id,
    dayId: id.nullable(),
    position,
    title: itemFields.title,
    kind: itemFields.kind,
  }),
  z.strictObject({
    type: z.literal('item.update'),
    itemId: id,
    baseVersion: z.int().positive(),
    fields: z.strictObject(itemFields).partial().refine(notEmpty),
  }),
  z.strictObject({ type: z.literal('item.move'), itemId: id, dayId: id.nullable(), position }),
  z.strictObject({ type: z.literal('item.delete'), itemId: id }),
  z.strictObject({ type: z.literal('item.restore'), itemId: id }),
])

export type Operation = z.infer<typeof operationSchema>

export const operationRequestSchema = z.strictObject({ opId: id, op: operationSchema })
export type OperationRequest = z.infer<typeof operationRequestSchema>

export const operationErrors = ['forbidden', 'not_found', 'deleted', 'invalid'] as const
export type OperationErrorCode = (typeof operationErrors)[number]
