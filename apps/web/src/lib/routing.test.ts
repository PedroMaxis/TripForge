import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type Leg, legKey } from '@tripforge/core'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createRouter } from './routing'

const a = { lat: -19.8545, lng: -43.9701 }
const b = { lat: -19.8549, lng: -43.9803 }
const far = { lat: -19.95, lng: -43.9 }
let server: Server
let requests: { url: string; at: number }[]
let answer: (url: string) => { status: number; body?: unknown }
let saved: Record<string, Leg>

const route = (distance: number) => ({
  status: 200,
  body: {
    routes: [
      {
        distance,
        duration: 60,
        geometry: {
          coordinates: [
            [-43.97, -19.85],
            [-43.98, -19.86],
          ],
        },
      },
    ],
  },
})

beforeEach(async () => {
  requests = []
  saved = {}
  answer = () => route(1000)
  server = createServer((req, res) => {
    requests.push({ url: req.url!, at: Date.now() })
    const { status, body } = answer(req.url!)
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body ?? {}))
  })
  await new Promise<void>((r) => server.listen(0, r))
})
afterEach(() => new Promise((r) => server.close(r)))

const router = (over = {}) =>
  createRouter({
    url: `http://localhost:${(server.address() as AddressInfo).port}`,
    intervalMs: 50,
    retryMs: 200,
    save: async (key, leg) => {
      saved[key] = leg
    },
    ...over,
  })
const leg = (from: typeof a, to: typeof a) => ({ from, to, key: legKey(from, to) })

test('a short way is walked', async () => {
  const r = router()
  expect(r.request([leg(a, b)])).toBe(1)
  await r.idle()
  expect(saved[legKey(a, b)]).toEqual({
    mode: 'foot',
    meters: 1000,
    seconds: 60,
    line: [
      [-43.97, -19.85],
      [-43.98, -19.86],
    ],
  })
  expect(requests.map((x) => x.url)).toEqual([
    expect.stringContaining('/routed-foot/route/v1/driving/-43.9701,-19.8545;-43.9803,-19.8549'),
  ])
})
test('a detour over 2 km is driven instead', async () => {
  answer = (url) => route(url.includes('foot') ? 3400 : 3200)
  const r = router()
  r.request([leg(a, b)])
  await r.idle()
  expect(saved[legKey(a, b)]).toMatchObject({ mode: 'car', meters: 3200 })
})
test('a long way is not even asked on foot', async () => {
  const r = router()
  r.request([leg(a, far)])
  await r.idle()
  expect(requests.every((x) => x.url.includes('routed-car'))).toBe(true)
})
test('keeps its distance between requests', async () => {
  // Seen from the other end, where a busy machine may shift each arrival a little.
  const r = router({ intervalMs: 250 })
  r.request([leg(a, b), leg(b, far), leg(far, a)])
  await r.idle()
  expect(requests.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < requests.length; i++) {
    expect(requests[i]!.at - requests[i - 1]!.at).toBeGreaterThanOrEqual(150)
  }
})

test('the same leg is asked for once', async () => {
  const r = router()
  r.request([leg(a, b)])
  r.request([leg(a, b)])
  await r.idle()
  expect(requests).toHaveLength(1)
})
test('a failure is left alone for a while, then tried again', async () => {
  answer = () => ({ status: 500 })
  const r = router()
  r.request([leg(a, far)])
  await r.idle()
  expect(r.request([leg(a, far)])).toBe(0)
  await new Promise((f) => setTimeout(f, 220))
  answer = () => route(9000)
  expect(r.request([leg(a, far)])).toBe(1)
  await r.idle()
  expect(saved[legKey(a, far)]?.mode).toBe('car')
})
test('without an address it asks nothing', () => {
  expect(router({ url: undefined }).request([leg(a, b)])).toBe(0)
})
