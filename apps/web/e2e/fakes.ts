// Stands in for every outside service, so the tests never touch the internet.
import { createServer } from 'node:http'
import { PNG } from 'pngjs'
import { SMTPServer } from 'smtp-server'
import { env } from './env.ts'

const places = [
  ['Belo Horizonte', 'R1', -43.9386, -19.9208, { state: 'Minas Gerais', country: 'Brazil' }],
  [
    'Mercado Central',
    'W2',
    -43.943,
    -19.9226,
    { city: 'Belo Horizonte', osm_key: 'amenity', osm_value: 'marketplace' },
  ],
  ['Casa do Baile', 'W3', -43.9701, -19.8545, { city: 'Belo Horizonte' }],
  ['Casa Kubitschek', 'W4', -43.9803, -19.8549, { city: 'Belo Horizonte' }],
  ['Mineirão', 'W5', -43.9711, -19.866, { city: 'Belo Horizonte' }],
] as const

const hills = new PNG({ width: 256, height: 256 })
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const v = 800 + 200 * Math.sin(x / 40) * Math.cos(y / 40) + 32768
    hills.data.set([Math.floor(v / 256), Math.floor(v % 256), 0, 255], (y * 256 + x) * 4)
  }
}
const terrain = PNG.sync.write(hills)
const mails: { to: string; body: string }[] = []

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const json = (body: unknown) =>
    res
      .writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      .end(JSON.stringify(body))

  if (url.pathname === '/photon/api') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    return json({
      features: places
        .filter(([name]) => name.toLowerCase().includes(q))
        .map(([name, ref, lng, lat, rest]) => ({
          geometry: { coordinates: [lng, lat] },
          properties: { name, osm_type: ref[0], osm_id: Number(ref.slice(1)), ...rest },
        })),
    })
  }
  const route = url.pathname.match(/^\/osrm\/routed-(foot|car)\/route\/v1\/driving\/(.+);(.+)$/)
  if (route) {
    const [from, to] = [route[2], route[3]].map((p) => (p ?? '').split(',').map(Number))
    const coordinates = [from, [from?.[0], to?.[1]], to]
    return json({
      routes: [
        { distance: route[1] === 'foot' ? 3400 : 3200, duration: 1500, geometry: { coordinates } },
      ],
    })
  }
  if (url.pathname === '/style.json') {
    return json({
      version: 8,
      // A source with data makes the map start its worker, as any real map does.
      sources: {
        land: {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
        },
      },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#eeeeee' } },
        { id: 'land', type: 'circle', source: 'land' },
      ],
    })
  }
  if (url.pathname.startsWith('/terrain/')) {
    return res
      .writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' })
      .end(terrain)
  }
  if (url.pathname === '/mails') return json(mails)
  res.writeHead(200).end('ok')
}).listen(Number(new URL(env.PHOTON_URL).port))

new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, session, done) {
    let body = ''
    stream.on('data', (chunk) => {
      body += chunk
    })
    stream.on('end', () => {
      mails.push({ to: session.envelope.rcptTo[0]?.address ?? '', body })
      done()
    })
  },
}).listen(Number(new URL(env.SMTP_URL).port))
