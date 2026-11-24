/** A fixed window per key, in memory: enough for one process. */
export function createRateLimit({
  max,
  windowMs,
  now = Date.now,
}: {
  max: number
  windowMs: number
  now?: () => number
}) {
  const windows = new Map<string, { since: number; count: number }>()
  return (key: string) => {
    const time = now()
    if (windows.size > 10_000) windows.clear()
    const current = windows.get(key)
    if (!current || time - current.since >= windowMs) {
      windows.set(key, { since: time, count: 1 })
      return true
    }
    current.count++
    return current.count <= max
  }
}
