import { z } from 'zod'
import { clockIn } from './trip-day'

export const weatherKinds = ['sun', 'partly', 'cloudy', 'fog', 'rain', 'storm', 'snow'] as const
export type WeatherKind = (typeof weatherKinds)[number]
export type DayWeather = { date: string; min: number; max: number; kind: WeatherKind }

const period = z
  .object({
    summary: z.object({ symbol_code: z.string() }),
    details: z
      .object({ air_temperature_min: z.number(), air_temperature_max: z.number() })
      .partial()
      .optional(),
  })
  .optional()
const answerSchema = z.object({
  properties: z.object({
    timeseries: z.array(
      z.object({
        time: z.string(),
        data: z.object({
          instant: z.object({ details: z.object({ air_temperature: z.number() }) }),
          next_1_hours: period,
          next_6_hours: period,
          next_12_hours: period,
        }),
      }),
    ),
  }),
})

/** The symbols of MET Norway, down to what someone packing a bag needs to know. */
export function weatherKind(symbol: string): WeatherKind {
  if (symbol.includes('thunder')) return 'storm'
  if (/snow|sleet/.test(symbol)) return 'snow'
  if (symbol.includes('rain')) return 'rain'
  if (symbol.startsWith('fog')) return 'fog'
  if (symbol.startsWith('partlycloudy')) return 'partly'
  return /^(clearsky|fair)/.test(symbol) ? 'sun' : 'cloudy'
}

/** A forecast of MET Norway, day by day on the clock of a timezone. */
export function parseForecast(answer: unknown, timezone: string): DayWeather[] {
  const parsed = answerSchema.safeParse(answer)
  if (!parsed.success) return []
  const days = new Map<string, { temperatures: number[]; kind?: WeatherKind; off: number }>()
  for (const { time, data } of parsed.data.properties.timeseries) {
    const local = clockIn(timezone, new Date(time))
    const day = days.get(local.date) ?? { temperatures: [], off: Infinity }
    days.set(local.date, day)
    const { air_temperature_min: min, air_temperature_max: max } = data.next_6_hours?.details ?? {}
    day.temperatures.push(data.instant.details.air_temperature)
    const hour = Number(local.time.slice(0, 2))
    // What comes next belongs to this day only while most of it still falls in it.
    if (hour <= 18) day.temperatures.push(...[min, max].filter((v) => v !== undefined))
    const symbol = (data.next_6_hours ?? data.next_12_hours ?? data.next_1_hours)?.summary
    const off = Math.abs(hour - 12)
    // Of today, whatever is left; of other days, only what is known of their middle.
    if (symbol && (off <= 4 || days.size === 1) && off < day.off) {
      day.off = off
      day.kind = weatherKind(symbol.symbol_code)
    }
  }
  return [...days].flatMap(([date, { temperatures, kind }]) =>
    kind
      ? [
          {
            date,
            min: Math.round(Math.min(...temperatures)),
            max: Math.round(Math.max(...temperatures)),
            kind,
          },
        ]
      : [],
  )
}
