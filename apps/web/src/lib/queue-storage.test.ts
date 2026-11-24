import type { OperationRequest } from '@tripforge/core'
import { expect, test } from 'vitest'
import { createQueueStorage } from './queue-storage'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}
const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const request = (n: number): OperationRequest => ({
  opId: uuid(n),
  op: { type: 'item.delete', itemId: uuid(n) },
})

test('keeps the queue and clears it when it empties', () => {
  const m = memory()
  const q = createQueueStorage('k', m)
  q.save([request(1)])
  expect(createQueueStorage('k', m).load()).toEqual([request(1)])
  q.save([])
  expect(m.data.size).toBe(0)
})
test('two tabs do not erase each other', () => {
  const m = memory()
  const [a, b] = [createQueueStorage('k', m), createQueueStorage('k', m)]
  a.save([request(1)])
  b.save([request(2)])
  a.save([])
  expect(createQueueStorage('k', m).load()).toEqual([request(2)])
})
test('what was loaded counts as its own afterwards', () => {
  const m = memory()
  createQueueStorage('k', m).save([request(1)])
  const q = createQueueStorage('k', m)
  q.load()
  q.save([])
  expect(m.data.size).toBe(0)
})
test('rubbish or blocked storage is an empty queue', () => {
  const m = memory()
  m.data.set('k', '{"nope":')
  expect(createQueueStorage('k', m).load()).toEqual([])
  m.data.set('k', '[{"opId":"x"}]')
  expect(createQueueStorage('k', m).load()).toEqual([])
  const blocked = {
    getItem: () => {
      throw new Error('no')
    },
    setItem: () => {
      throw new Error('no')
    },
    removeItem: () => {
      throw new Error('no')
    },
  }
  const q = createQueueStorage('k', blocked)
  q.save([request(1)])
  expect(q.load()).toEqual([])
})
