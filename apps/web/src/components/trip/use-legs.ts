'use client'

import { type Leg, type Trip, tripLegs } from '@tripforge/core'
import { useEffect, useState } from 'react'

const pollMs = 2000

/** The street routes between the stops, asked for as the trip changes and collected as they come. */
export function useLegs(trip: Trip, settled: boolean, source: string) {
  const [legs, setLegs] = useState<Record<string, Leg>>({})
  const missing = tripLegs(trip.items)
    .map((l) => l.key)
    .filter((key) => !legs[key])
    .join('|')

  useEffect(() => {
    if (!missing || !settled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const res = await fetch(`${source}/routes`)
        if (stopped || !res.ok) return
        const answer = (await res.json()) as { legs: Record<string, Leg>; pending: number }
        setLegs((current) => ({ ...current, ...answer.legs }))
        if (answer.pending > 0) timer = setTimeout(load, pollMs)
      } catch {
        // Without routes the map draws straight lines.
      }
    }
    void load()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [missing, settled, source])

  return legs
}
