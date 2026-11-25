export const locales = ['en', 'pt-BR'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export const roles = ['owner', 'editor', 'viewer'] as const
export type Role = (typeof roles)[number]

export const itemKinds = ['activity', 'food', 'transport', 'lodging', 'other'] as const
export type ItemKind = (typeof itemKinds)[number]

export const operationTypes = [
  'item.create',
  'item.update',
  'item.move',
  'item.delete',
  'item.restore',
  'day.update',
  'day.order',
  'trip.update',
  'member.changed',
] as const
export type OperationType = (typeof operationTypes)[number]
