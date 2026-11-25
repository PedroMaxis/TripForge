import { describe, expect, test } from 'vitest'
import {
  distanceKm,
  lateFor,
  legKey,
  operationSchema,
  parsePhoton,
  routeMode,
  stopsWithPlace,
  tripLegs,
} from './index'

const baile = { lat: -19.8545, lng: -43.9701 }
const kubitschek = { lat: -19.8549, lng: -43.9803 }
const item = (id: string, over: object = {}) => ({
  id,
  dayId: 'd1',
  position: id,
  kind: 'activity' as const,
  title: id,
  startTime: null,
  endTime: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  osmRef: null,
  notes: null,
  done: false,
  version: 1,
  updatedBy: null,
  ...over,
})

describe('distances', () => {
  test('Casa do Baile to Casa Kubitschek is about 1.1 km', () => {
    expect(distanceKm(baile, kubitschek)).toBeCloseTo(1.07, 1)
  })
})

describe('legs', () => {
  test('connect neighboring stops of the same day, skipping those without a place', () => {
    const items = [
      item('a', baile),
      item('b'),
      item('c', kubitschek),
      item('x', { ...baile, dayId: 'd2' }),
    ]
    expect(tripLegs(items).map((l) => [l.from.lat, l.to.lng])).toEqual([
      [baile.lat, kubitschek.lng],
    ])
  })
  test('ideas have none', () => {
    expect(
      tripLegs([item('a', { ...baile, dayId: null }), item('b', { ...kubitschek, dayId: null })]),
    ).toEqual([])
  })
  test('the same place twice needs no leg', () => {
    expect(tripLegs([item('a', baile), item('b', baile)])).toEqual([])
  })
  test('a leg across an ocean is not routed', () => {
    expect(tripLegs([item('a', baile), item('b', { lat: 38.7, lng: -9.1 })])).toEqual([])
  })
  test('the same two places share one key, whoever asks', () => {
    expect(legKey({ lat: -19.85450001, lng: -43.9701 }, kubitschek)).toBe(legKey(baile, kubitschek))
  })
  test('stops keep their number even when others have no place', () => {
    expect(stopsWithPlace([item('a'), item('b', baile)]).map((s) => s.number)).toEqual([2])
  })
})

test('walks up to 2 km and drives beyond that', () => {
  expect([routeMode(2000), routeMode(2001)]).toEqual(['foot', 'car'])
})

describe('arriving late', () => {
  const at = (start: string | null, end: string | null) =>
    item('x', { startTime: start, endTime: end })
  test('when the way does not fit before the next start', () => {
    expect(lateFor(at('09:00', '10:00'), at('10:10', null), 20 * 60)).toBe('travel')
  })
  test('when the next starts before this one ends', () => {
    expect(lateFor(at('09:00', '10:00'), at('09:30', null), null)).toBe('overlap')
  })
  test('not when it fits, or when the times are not known', () => {
    expect(lateFor(at('09:00', '10:00'), at('10:30', null), 20 * 60)).toBeNull()
    expect(lateFor(at('09:00', null), at('09:05', null), 20 * 60)).toBeNull()
    expect(lateFor(at(null, null), at('09:05', null), 20 * 60)).toBeNull()
  })
})

describe('Photon results', () => {
  const feature = (properties: object, coordinates = [-43.9430243, -19.9225815]) => ({
    geometry: { coordinates },
    properties,
  })
  test('become a name, an address and coordinates', () => {
    const found = parsePhoton({
      features: [
        feature({
          osm_type: 'W',
          osm_id: 29442614,
          name: 'Mercado Central',
          street: 'Avenida Augusto de Lima',
          housenumber: '744',
          district: 'Centro',
          city: 'Belo Horizonte',
          state: 'Minas Gerais',
          country: 'Brazil',
        }),
      ],
    })
    expect(found).toEqual([
      {
        name: 'Mercado Central',
        address: 'Avenida Augusto de Lima 744, Centro, Belo Horizonte, Minas Gerais, Brazil',
        lat: -19.92258,
        lng: -43.94302,
        osmRef: 'W29442614',
        kind: 'activity',
      },
    ])
  })
  test('an address without a name is named after its street', () => {
    expect(
      parsePhoton({
        features: [
          feature({
            osm_type: 'N',
            osm_id: 1,
            street: 'Rua da Bahia',
            housenumber: '10',
            city: 'BH',
          }),
        ],
      })[0]?.name,
    ).toBe('Rua da Bahia 10')
  })
  test('the name is not repeated in the address', () => {
    expect(
      parsePhoton({
        features: [
          feature({
            osm_type: 'R',
            osm_id: 1,
            name: 'Belo Horizonte',
            city: 'Belo Horizonte',
            country: 'Brazil',
          }),
        ],
      })[0]?.address,
    ).toBe('Brazil')
  })
  test('the same place twice is listed once', () => {
    const f = feature({ osm_type: 'W', osm_id: 1, name: 'A', city: 'B' })
    expect(parsePhoton({ features: [f, f] })).toHaveLength(1)
  })
  test('anything unexpected is dropped', () => {
    expect(
      parsePhoton({
        features: [feature({}), feature({ name: 'A', osm_type: 'N', osm_id: 1 }, [999, 0])],
      }),
    ).toEqual([])
    expect(parsePhoton(null)).toEqual([])
  })
})

describe('places in operations', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const update = (fields: object) =>
    operationSchema.safeParse({ type: 'item.update', itemId: id, baseVersion: 1, fields }).success
  test('coordinates come in pairs', () => {
    expect([
      update({ lat: 1, lng: 2 }),
      update({ lat: null, lng: null }),
      update({ lat: 1 }),
      update({ lat: 1, lng: null }),
    ]).toEqual([true, true, false, false])
  })
  test('and inside the globe', () => {
    expect(update({ lat: 91, lng: 0 })).toBe(false)
  })
})

describe('the kind of a place', () => {
  const kindOf = (osm_key: string, osm_value: string) =>
    parsePhoton({
      features: [
        {
          geometry: { coordinates: [0, 0] },
          properties: { osm_type: 'N', osm_id: 1, name: 'A', osm_key, osm_value },
        },
      ],
    })[0]?.kind
  test.each([
    ['amenity', 'restaurant', 'food'],
    ['amenity', 'marketplace', 'food'],
    ['shop', 'bakery', 'food'],
    ['tourism', 'hotel', 'lodging'],
    ['aeroway', 'aerodrome', 'transport'],
    ['railway', 'station', 'transport'],
    ['amenity', 'bus_station', 'transport'],
    ['tourism', 'museum', 'activity'],
    ['leisure', 'park', 'activity'],
    ['place', 'city', 'other'],
    ['highway', 'residential', 'other'],
  ])('%s=%s is %s', (key, value, kind) => {
    expect(kindOf(key, value)).toBe(kind)
  })
  test('nothing known is an activity', () => {
    expect(
      parsePhoton({
        features: [
          {
            geometry: { coordinates: [0, 0] },
            properties: { osm_type: 'N', osm_id: 1, name: 'A' },
          },
        ],
      })[0]?.kind,
    ).toBe('activity')
  })
})
