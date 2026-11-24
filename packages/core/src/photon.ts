import { z } from 'zod'
import type { ItemKind } from './domain'
import { type Place, roundCoordinate } from './geo'

const text = z.string().optional()
const featureSchema = z.object({
  geometry: z.object({
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  properties: z.object({
    osm_type: z.string(),
    osm_id: z.number(),
    osm_key: text,
    osm_value: text,
    name: text,
    street: text,
    housenumber: text,
    district: text,
    city: text,
    state: text,
    country: text,
  }),
})

const food =
  /^(restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|biergarten|marketplace|bakery|pastry|confectionery)$/
const lodging = /^(hotel|hostel|guest_house|motel|apartment|chalet|camp_site)$/
const transport = /^(station|halt|bus_station|ferry_terminal|aerodrome|terminal|taxi|car_rental)$/

/** A first guess, from what OpenStreetMap says the place is. People can change it. */
function kindOf(key: string | undefined, value = ''): ItemKind {
  if (food.test(value)) return 'food'
  if (lodging.test(value)) return 'lodging'
  if (key === 'aeroway' || transport.test(value)) return 'transport'
  return key === 'place' || key === 'highway' || key === 'boundary' ? 'other' : 'activity'
}

/** Reads a Photon answer, leaving out whatever does not look like a place. */
export function parsePhoton(body: unknown): Place[] {
  const features = z.object({ features: z.array(z.unknown()) }).safeParse(body)
  if (!features.success) return []
  const places = features.data.features.flatMap((raw): Place[] => {
    const parsed = featureSchema.safeParse(raw)
    if (!parsed.success) return []
    const { properties: p, geometry } = parsed.data
    const street = [p.street, p.housenumber].filter(Boolean).join(' ')
    const name = p.name || street
    if (!name) return []
    const address = [street, p.district, p.city, p.state, p.country]
      .filter((part) => part && part !== name)
      .join(', ')
    const [lng, lat] = geometry.coordinates
    return [
      {
        name: name.slice(0, 200),
        address: address.slice(0, 300),
        lat: roundCoordinate(lat),
        lng: roundCoordinate(lng),
        osmRef: `${p.osm_type}${p.osm_id}`,
        kind: kindOf(p.osm_key, p.osm_value),
      },
    ]
  })
  return places.filter((place, i) => places.findIndex((p) => p.osmRef === place.osmRef) === i)
}
