import type { StyleSpecification } from 'maplibre-gl'

const names = [
  'land',
  'water',
  'park',
  'road',
  'major',
  'building',
  'contour',
  'route',
  'other',
  'label',
] as const
export type MapColors = Record<(typeof names)[number], string>

/** The map takes its colors from the page. MapLibre cannot read oklch, so a canvas translates. */
export function readMapColors(): MapColors {
  const css = getComputedStyle(document.documentElement)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  return Object.fromEntries(
    names.map((name) => {
      context.fillStyle = css.getPropertyValue(`--map-${name}`)
      context.fillRect(0, 0, 1, 1)
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      return [name, `rgb(${r}, ${g}, ${b})`]
    }),
  ) as MapColors
}

/** Repaints an OpenMapTiles style in our colors and leaves its structure alone. */
export function paintStyle(style: StyleSpecification, c: MapColors): StyleSpecification {
  const layers = style.layers.map((layer): StyleSpecification['layers'][number] => {
    const id = layer.id
    switch (layer.type) {
      case 'background':
        return { ...layer, paint: { ...layer.paint, 'background-color': c.land } }
      case 'fill': {
        if (/building/.test(id))
          return { ...layer, paint: { ...layer.paint, 'fill-color': c.building } }
        const color = /water/.test(id)
          ? c.water
          : /park|wood|grass|landcover|green/.test(id)
            ? c.park
            : c.land
        return { ...layer, paint: { ...layer.paint, 'fill-color': color } }
      }
      case 'line': {
        const color = /water/.test(id)
          ? c.water
          : /casing/.test(id)
            ? c.land
            : /motorway|trunk|major|primary/.test(id)
              ? c.major
              : c.road
        return { ...layer, paint: { ...layer.paint, 'line-color': color } }
      }
      case 'symbol':
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'text-color': c.label,
            'text-halo-color': c.land,
            'text-halo-width': 1.4,
          },
        }
      default:
        return layer
    }
  })
  return { ...style, layers }
}
