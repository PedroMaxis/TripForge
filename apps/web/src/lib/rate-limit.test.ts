import { expect, test } from 'vitest'
import { createRateLimit } from './rate-limit'

test('lets through up to the limit, per key, and opens again later', () => {
  let now = 0
  const allow = createRateLimit({ max: 2, windowMs: 1000, now: () => now })
  expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true])
  now = 1001
  expect(allow('a')).toBe(true)
})
