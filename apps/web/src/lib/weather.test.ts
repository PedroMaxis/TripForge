import { afterEach, expect, test, vi } from 'vitest'
import { createForecasts } from './weather'

const answer = {
  properties: {
    timeseries: [
      {
        time: '2027-03-04T12:00:00Z',
        data: {
          instant: { details: { air_temperature: 20 } },
          next_6_hours: { summary: { symbol_code: 'rain' } },
        },
      },
    ],
  },
}
afterEach(() => vi.unstubAllGlobals())
function setup(respond: () => Response | Promise<Response>) {
  const fetched = vi.fn(async (_: URL, __?: RequestInit) => respond())
  vi.stubGlobal('fetch', fetched)
  let time = 0
  const pass = (ms: number) => {
    time += ms
  }
  const forecasts = createForecasts({ url: 'http://met', agent: 'TripForge', now: () => time })
  return { fetched, forecasts, pass }
}
const bh = { lat: -19.9208, lng: -43.9386 }

test('asks once for the same part of town, and again after an hour', async () => {
  const { fetched, forecasts, pass } = setup(() => Response.json(answer))
  expect(await forecasts(bh, 'UTC')).toEqual([
    { date: '2027-03-04', min: 20, max: 20, kind: 'rain' },
  ])
  await forecasts({ lat: -19.93, lng: -43.94 }, 'UTC')
  expect(fetched).toHaveBeenCalledTimes(1)
  const [url, init] = fetched.mock.calls[0]!
  expect(String(url)).toBe('http://met/complete?lat=-19.9&lon=-43.9')
  expect(new Headers(init?.headers).get('user-agent')).toBe('TripForge')
  pass(61 * 60_000)
  await forecasts(bh, 'UTC')
  expect(fetched).toHaveBeenCalledTimes(2)
})
test('two askers at once share one question', async () => {
  const { fetched, forecasts } = setup(() => Response.json(answer))
  await Promise.all([forecasts(bh, 'UTC'), forecasts(bh, 'UTC')])
  expect(fetched).toHaveBeenCalledTimes(1)
})
test('a failure is an empty forecast, tried again a little later', async () => {
  const { fetched, forecasts, pass } = setup(() => new Response(null, { status: 503 }))
  expect(await forecasts(bh, 'UTC')).toEqual([])
  await forecasts(bh, 'UTC')
  expect(fetched).toHaveBeenCalledTimes(1)
  pass(11 * 60_000)
  await forecasts(bh, 'UTC')
  expect(fetched).toHaveBeenCalledTimes(2)
})
