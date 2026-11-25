import { type DayWeather, type Point, parseForecast, type Trip } from '@tripforge/core'
import { env } from './env'

const goodMs = 60 * 60_000
const badMs = 10 * 60_000
const timeoutMs = 8000
const cacheSize = 300
const maxSpots = 4

/** Forecasts of MET Norway, kept for a while, as its terms ask. */
export function createForecasts({
  url,
  agent,
  now = Date.now,
}: {
  url: string
  agent: string
  now?: () => number
}) {
  const cache = new Map<string, { until: number; answer: Promise<unknown> }>()

  function ask({ lat, lng }: Point) {
    // One decimal, about 10 km: the weather is the same.
    const spot = new URL(`${url}/complete`)
    spot.searchParams.set('lat', lat.toFixed(1))
    spot.searchParams.set('lon', lng.toFixed(1))
    const kept = cache.get(spot.search)
    if (kept && kept.until > now()) return kept.answer
    const entry = { until: now() + goodMs, answer: Promise.resolve<unknown>(null) }
    entry.answer = fetch(spot, {
      headers: { 'user-agent': agent },
      signal: AbortSignal.timeout(timeoutMs),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Weather answered ${res.status}`)
        return res.json()
      })
      .catch(() => {
        entry.until = now() + badMs
        return null
      })
    if (cache.size >= cacheSize) cache.clear()
    cache.set(spot.search, entry)
    return entry.answer
  }

  return async (point: Point, timezone: string): Promise<DayWeather[]> =>
    parseForecast(await ask(point), timezone)
}

let forecasts: ReturnType<typeof createForecasts> | undefined

/** The weather of each day of a trip that is near enough to be known. */
export async function tripWeather(trip: Trip): Promise<Record<string, DayWeather>> {
  const { WEATHER_URL, APP_URL } = env()
  if (WEATHER_URL === 'off') return {}
  forecasts ??= createForecasts({ url: WEATHER_URL, agent: `TripForge ${APP_URL}` })
  const { destinationLat, destinationLng } = trip
  const home =
    destinationLat !== null && destinationLng !== null
      ? { lat: destinationLat, lng: destinationLng }
      : null
  // Where that day starts, for trips through several places.
  const spots = new Map<string, Point>()
  const key = (p: Point) => `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`
  const byDay = trip.days.map((day) => {
    const stop = trip.items.find((i) => i.dayId === day.id && i.lat !== null && i.lng !== null)
    const wanted = stop ? { lat: stop.lat!, lng: stop.lng! } : home
    if (wanted && !spots.has(key(wanted)) && spots.size < maxSpots) spots.set(key(wanted), wanted)
    return { date: day.date, spot: wanted && spots.has(key(wanted)) ? key(wanted) : null }
  })
  const known = new Map(
    await Promise.all(
      [...spots].map(async ([name, p]) => [name, await forecasts!(p, trip.timezone)] as const),
    ),
  )
  return Object.fromEntries(
    byDay.flatMap(({ date, spot }) => {
      const weather = spot && known.get(spot)?.find((w) => w.date === date)
      return weather ? [[date, weather]] : []
    }),
  )
}

const day = 86_400_000

/** Forecasts reach about ten days ahead, so there is no point in asking for other trips. */
export function hasForecast(trip: Pick<Trip, 'startDate' | 'endDate'>, now = Date.now()) {
  return Date.parse(trip.startDate) - now < 11 * day && now - Date.parse(trip.endDate) < 2 * day
}
