// Keeps only what is the same for everyone: built files and the offline page. Trips are private
// and live, so they always come from the server.
const version = 'v2'
const offlinePage = '/offline.html'
const maxFiles = 200

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
      .then((names) => Promise.all(names.filter((n) => n !== version).map((n) => caches.delete(n))))
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(builtFile(request))
  } else if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(offlinePage)))
  }
})
