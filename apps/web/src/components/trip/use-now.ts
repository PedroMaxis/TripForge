'use client'

import { clockIn } from '@tripforge/core'
import { useEffect, useState } from 'react'

const tickMs = 30_000

/** The date and time there. Null until mounted: the server's clock is not the reader's. */
export function useNow(timezone: string) {
  const [now, setNow] = useState<{ date: string; time: string } | null>(null)
  useEffect(() => {
    const tick = () =>
      setNow((last) => {
        const next = clockIn(timezone)
        return last?.date === next.date && last.time === next.time ? last : next
      })
    tick()
    const timer = setInterval(tick, tickMs)
    return () => clearInterval(timer)
  }, [timezone])
  return now
}
