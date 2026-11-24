import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { routeLegs } from './index'
import { findLegs, saveLeg } from './routes'
import { createTestDb, type TestDb } from './testing'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
})
afterAll(() => t.close())
beforeEach(async () => {
  await t.db.delete(routeLegs)
})
const leg = {
  mode: 'car' as const,
  meters: 3231,
  seconds: 297,
  line: [
    [-43.97, -19.85],
    [-43.98, -19.86],
  ] as [number, number][],
}

test('a saved leg is found again', async () => {
  await saveLeg(t.db, 'a;b', leg)
  expect(await findLegs(t.db, ['a;b', 'b;c'])).toEqual({ 'a;b': leg })
})
test('saving it twice keeps the newer', async () => {
  await saveLeg(t.db, 'a;b', leg)
  await saveLeg(t.db, 'a;b', { ...leg, mode: 'foot' })
  expect((await findLegs(t.db, ['a;b']))['a;b']?.mode).toBe('foot')
})
test('no keys, no query', async () => {
  expect(await findLegs(t.db, [])).toEqual({})
})
