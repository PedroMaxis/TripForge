/** Must match the name in public/sw.js. */
const tripsCache = 'trips'

/** The copies of trips kept for reading offline; gone on sign-out, so a shared device keeps none. */
export async function forgetTrips() {
  try {
    await globalThis.caches?.delete(tripsCache)
  } catch {
    // Storage blocked: then nothing was kept either.
  }
}
