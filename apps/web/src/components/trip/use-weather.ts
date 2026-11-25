'use client'

import type { DayWeather } from '@tripforge/core'
import { useEffect, useState } from 'react'

const refreshMs = 60 * 60_000

/** The weather by date, for the days near enough to have a forecast. */
export function useWeather(source: string) {
  const [weather, setWeather] = useState<Record<string, DayWeather>>({})
  useEffect(() => {
    let gone = false
    async function load() {
      try {
        const res = await fetch(`${source}/weather`)
        if (res.ok && !gone) setWeather((await res.json()) as Record<string, DayWeather>)
      } catch {
        // Nice to have: without it the day simply shows no weather.
      }
    }
    void load()
    const timer = setInterval(load, refreshMs)
    return () => {
      gone = true
      clearInterval(timer)
    }
  }, [source])
  return weather
}
