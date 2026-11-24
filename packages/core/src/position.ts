import { generateKeyBetween } from 'fractional-indexing'

export function isPosition(key: string) {
  try {
    generateKeyBetween(key, null)
    return /^[0-9A-Za-z]{2,200}$/.test(key)
  } catch {
    return false
  }
}

/** A key between two neighbors; null means the start or the end of the list. */
export const positionBetween = (before: string | null, after: string | null) =>
  generateKeyBetween(before, after)

/** Orders items the way the database does: by position, then id, byte by byte. */
export function byPosition(
  a: { position: string; id: string },
  b: { position: string; id: string },
) {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1
  return a.id < b.id ? -1 : 1
}
