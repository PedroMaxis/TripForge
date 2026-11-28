// Keeps what is the same for everyone (built files and the offline page) and, apart, the last copy
// of each trip opened on this device, so it can still be read without a connection. Trips always
// come from the server first; the copy is only for when there is no answer.
const version = 'v3'
const offlinePage = '/offline.html'
const maxFiles = 200
const tripsCache = 'trips'
const maxTrips = 30
// A trip, or one seen through a link; not its money, lists or settings.
const tripPage = /^\/(en|pt-BR)\/(trips\/[0-9a-f-]{36}|see\/[\w-]{20,})$/
// On a weak signal, waiting longer than this for the server is worse than an older copy.
const patience = 6000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(version)
      .then((cache) => cache.add(offlinePage))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== version && n !== tripsCache).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Built files carry a hash in their name, so a kept one is never out of date.
async function builtFile(request) {
  const cache = await caches.open(version)
  const kept = await cache.match(request)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    const files = (await cache.keys()).filter((r) => !r.url.endsWith(offlinePage))
    if (files.length > maxFiles) await cache.delete(files[0])
  }
  return response
}

async function trip(request) {
  const cache = await caches.open(tripsCache)
  const key = new URL(request.url).pathname
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve('late'), patience)
  })
  const answer = fetch(request)
  try {
    const first = await Promise.race([answer, late])
    if (first === 'late') {
      const copy = await cache.match(key)
      if (copy) {
        // Keep the copy fresh for next time, without making anyone wait for it.
        answer
          .then((res) => (res.status >= 500 ? undefined : store(cache, key, res)))
          .catch(() => {})
        return copy
      }
    }
    const response = await answer
    // A server in trouble is like no connection: the copy is still the best there is.
    if (response.status >= 500) return (await cache.match(key)) ?? response
    await store(cache, key, response.clone())
    return response
  } catch {
    return (await cache.match(key)) ?? (await caches.match(offlinePage))
  } finally {
    clearTimeout(timer)
  }
}

// Only a page that really opened is kept. Anything else (signed out, no access any more, gone)
// takes the old copy away too.
async function store(cache, key, response) {
  if (response.ok && response.type === 'basic' && !response.redirected) {
    await cache.put(key, response)
    const keys = await cache.keys()
    if (keys.length > maxTrips) await cache.delete(keys[0])
  } else {
    await cache.delete(key)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(builtFile(request))
  } else if (request.mode === 'navigate' && tripPage.test(url.pathname)) {
    event.respondWith(trip(request))
  } else if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(offlinePage)))
  }
})
