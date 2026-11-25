import { expect, test } from 'vitest'
import { parseForecast, weatherKind } from './index'

const hour = (time: string, temperature: number, symbol?: string, range?: [number, number]) => ({
  time,
  data: {
    instant: { details: { air_temperature: temperature } },
    ...(symbol && {
      next_6_hours: {
        summary: { symbol_code: symbol },
        details: range ? { air_temperature_min: range[0], air_temperature_max: range[1] } : {},
      },
    }),
  },
})
const answer = (...timeseries: object[]) => ({ properties: { timeseries } })

test('sums up each day on the clock of the trip', () => {
  const got = parseForecast(
    answer(
      hour('2027-03-04T15:00:00Z', 24.6, 'partlycloudy_day', [22.2, 27.7]),
      hour('2027-03-05T02:00:00Z', 18.4, 'clearsky_night'),
      hour('2027-03-05T15:00:00Z', 21, 'rain', [19, 23]),
    ),
    'America/Sao_Paulo',
  )
  expect(got).toEqual([
    { date: '2027-03-04', min: 18, max: 28, kind: 'partly' },
    { date: '2027-03-05', min: 19, max: 23, kind: 'rain' },
  ])
})
test('leaves out a later day whose middle is unknown', () => {
  const got = parseForecast(
    answer(hour('2027-03-04T12:00:00Z', 20, 'fog'), hour('2027-03-05T00:00:00Z', 20, 'cloudy')),
    'UTC',
  )
  expect(got.map((d) => d.date)).toEqual(['2027-03-04'])
})
test('in the evening, today is what is left of it', () => {
  expect(parseForecast(answer(hour('2027-03-04T22:00:00Z', 20, 'cloudy')), 'UTC')).toEqual([
    { date: '2027-03-04', min: 20, max: 20, kind: 'cloudy' },
  ])
})
test('an answer that is not a forecast says nothing', () => {
  expect(parseForecast({ oops: true }, 'UTC')).toEqual([])
})
test.each([
  ['clearsky_day', 'sun'],
  ['fair_night', 'sun'],
  ['partlycloudy_day', 'partly'],
  ['cloudy', 'cloudy'],
  ['fog', 'fog'],
  ['lightrainshowers_day', 'rain'],
  ['heavyrainandthunder', 'storm'],
  ['lightsnow', 'snow'],
  ['sleetshowers_day', 'snow'],
  ['something_new', 'cloudy'],
])('%s is %s', (symbol, kind) => {
  expect(weatherKind(symbol)).toBe(kind)
})
