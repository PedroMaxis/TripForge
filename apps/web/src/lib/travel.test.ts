import { expect, test } from 'vitest'
import { formatDistance, formatDuration } from './travel'

test.each([
  [20, '1 min'],
  [13 * 60, '13 min'],
  [59.6 * 60, '1 h'],
  [60 * 60, '1 h'],
  [261 * 60, '4 h 21 min'],
  [25 * 3600 + 120, '25 h 2 min'],
])('%d seconds is %s', (seconds, text) => {
  expect(formatDuration(seconds)).toBe(text)
})
test.each([
  [940, 'pt-BR', '0,9 km'],
  [5232, 'en', '5.2 km'],
  [99_940, 'pt-BR', '99,9 km'],
  [311_000, 'pt-BR', '311 km'],
  [1_311_000, 'en', '1,311 km'],
])('%d meters in %s is %s', (meters, locale, text) => {
  expect(formatDistance(meters, locale)).toBe(text)
})
