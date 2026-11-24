import type { Point } from '@tripforge/core'
import { contours } from 'd3-contour'
import { PNG } from 'pngjs'

const zoom = 11
const tile = 256
const width = 460
const height = 240
const margin = 24
const line = '#9fbdaf'
const steps = [5, 10, 20, 40, 80, 160, 320]
const maxLevels = 18
const timeoutMs = 10_000

async function loadTile(template: string, x: number, y: number) {
  const url = template
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`Terrain answered ${res.status}`)
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()))
}

function blur(values: Float32Array, w: number, h: number) {
  const out = new Float32Array(values.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let j = Math.max(0, y - 2); j <= Math.min(h - 1, y + 2); j++) {
        for (let i = Math.max(0, x - 2); i <= Math.min(w - 1, x + 2); i++) {
          sum += values[j * w + i]!
          count++
        }
      }
      out[y * w + x] = sum / count
    }
  }
  return out
}

/** Draws the contour lines around a point, from Terrarium elevation tiles. */
export async function drawRelief({ lat, lng }: Point, template: string) {
  const tiles = 2 ** zoom
  const sin = Math.sin((lat * Math.PI) / 180)
  const centerX = ((lng + 180) / 360) * tiles * tile
  const centerY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * tiles * tile
  const left = Math.floor(centerX - width / 2 - margin)
  const top = Math.floor(centerY - height / 2 - margin)
  const w = width + margin * 2
  const h = height + margin * 2

  let land = new Float32Array(w * h)
  const jobs: Promise<void>[] = []
  for (let tx = Math.floor(left / tile); tx <= Math.floor((left + w - 1) / tile); tx++) {
    for (let ty = Math.floor(top / tile); ty <= Math.floor((top + h - 1) / tile); ty++) {
      if (ty < 0 || ty >= tiles) continue
      jobs.push(
        loadTile(template, ((tx % tiles) + tiles) % tiles, ty).then((png) => {
          for (let y = Math.max(0, ty * tile - top); y < Math.min(h, (ty + 1) * tile - top); y++) {
            for (
              let x = Math.max(0, tx * tile - left);
              x < Math.min(w, (tx + 1) * tile - left);
              x++
            ) {
              const at = ((y + top - ty * tile) * tile + (x + left - tx * tile)) * 4
              const [r, g, b] = png.data.subarray(at, at + 3)
              land[y * w + x] = r! * 256 + g! + b! / 256 - 32768
            }
          }
        }),
      )
    }
  }
  await Promise.all(jobs)
  for (let i = 0; i < 3; i++) land = blur(land, w, h)

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const value of land) {
    low = Math.min(low, value)
    high = Math.max(high, value)
  }
  // The sea floor is not part of the picture.
  low = Math.max(low, 1)
  const range = Math.max(0, high - low)
  const step = steps.find((s) => range / s <= maxLevels) ?? steps.at(-1)!
  const levels: number[] = []
  for (let v = Math.ceil(low / step) * step; v < high; v += step) levels.push(v)

  const paths = contours()
    .size([w, h])
    .thresholds(levels)(Array.from(land))
    .map(({ value, coordinates }) => {
      let d = ''
      for (const ring of coordinates.flat()) {
        if (ring.length < 24) continue
        let drawing = false
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = ring[i] as [number, number]
          // Contours also run along the edge of the data, outside the picture.
          if (x < 1 || y < 1 || x > w - 1 || y > h - 1) {
            drawing = false
            continue
          }
          d += `${drawing ? 'L' : 'M'}${(x - margin).toFixed(1)} ${(y - margin).toFixed(1)}`
          drawing = true
        }
      }
      const opacity = (0.35 + (0.65 * (value - low)) / (range || 1)).toFixed(2)
      return d && `<path d="${d}" opacity="${opacity}"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" stroke="${line}" stroke-width="1" preserveAspectRatio="xMidYMid slice">${paths}</svg>`
}
