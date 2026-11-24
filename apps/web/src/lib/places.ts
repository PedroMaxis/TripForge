import { type Place, type Point, parsePhoton } from '@tripforge/core'
import { env } from './env'

const cacheSize = 500
const timeoutMs = 6000
const cache = new Map<string, Place[]>()

// Photon speaks only a few languages; the others get the local names, which is what is wanted.
const languageOf = (locale: string) => (locale === 'en' ? 'en' : 'default')

export async function searchPlaces(query: string, near: Point | null, locale: string) {
  const url = new URL(`${env().PHOTON_URL}/api`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '6')
  url.searchParams.set('lang', languageOf(locale))
  if (near) {
    // One decimal, about 10 km, is close enough to prefer what is around.
    url.searchParams.set('lat', near.lat.toFixed(1))
    url.searchParams.set('lon', near.lng.toFixed(1))
  }
  const cached = cache.get(url.search)
  if (cached) return cached
  const res = await fetch(url, {
    headers: { 'user-agent': 'TripForge' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Photon answered ${res.status}`)
  const places = parsePhoton(await res.json())
  if (cache.size >= cacheSize) cache.clear()
  cache.set(url.search, places)
  return places
}
