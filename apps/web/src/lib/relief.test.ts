import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { drawRelief } from './relief'

let server: Server
let height: (x: number, y: number) => number
let url: string
beforeAll(async () => {
  server = createServer((req, res) => {
    const [, , x, y] = req.url!.match(/\/(\d+)\/(\d+)\/(\d+)\.png/)!
    const png = new PNG({ width: 256, height: 256 })
    for (let i = 0; i < 256; i++)
      for (let j = 0; j < 256; j++) {
        const v = height(Number(x) * 256 + i, Number(y) * 256 + j) + 32768
        png.data.set([Math.floor(v / 256), Math.floor(v % 256), 0, 255], (j * 256 + i) * 4)
      }
    res.writeHead(200).end(PNG.sync.write(png))
  })
  await new Promise<void>((r) => server.listen(0, r))
  url = `http://localhost:${(server.address() as AddressInfo).port}/{z}/{x}/{y}.png`
})
afterAll(() => new Promise((r) => server.close(r)))
const levels = (svg: string) => (svg.match(/<path/g) ?? []).length

test('a mountain becomes contour lines', async () => {
  height = (x, y) => 800 + 300 * Math.sin(x / 90) * Math.cos(y / 70)
  const svg = await drawRelief({ lat: -19.95, lng: -43.92 }, url)
  expect(svg).toMatch(/^<svg xmlns/)
  expect(levels(svg)).toBeGreaterThan(5)
  expect(levels(svg)).toBeLessThan(40)
})
test('gentle land still gets lines', async () => {
  height = (x) => 20 + 25 * Math.sin(x / 60)
  expect(levels(await drawRelief({ lat: 52.37, lng: 4.9 }, url))).toBeGreaterThan(2)
})
test('a flat place gives an empty drawing, not an error', async () => {
  height = () => 0
  expect(levels(await drawRelief({ lat: 0, lng: 0 }, url))).toBe(0)
})
test('works across the date line', async () => {
  height = (x, y) => 500 + 200 * Math.sin((x + y) / 80)
  expect(levels(await drawRelief({ lat: -16.8, lng: 179.99 }, url))).toBeGreaterThan(2)
})
