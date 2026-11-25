# TripForge

A collaborative trip planner: a group builds the itinerary day by day, together and in real time, with every stop on a map.

![Two people plan the same trip: a stop added on a computer appears on a phone, and the phone's edits appear on the computer](docs/live.gif)

**[Try it](https://tripforge.duckdns.org)**

## What it does

- Day-by-day itinerary with drag and drop, ideas without a day yet, autosave and undo
- Live editing: everyone sees changes as they happen, who is here and what they are editing
- Map with the way between stops by street, with distance, time, and a warning when there is no time to get there
- Place search, and a cover for each trip drawn from the real relief of its destination
- Invites to edit, and view links that open straight on the itinerary, with no account
- Offline edits are kept and sent later; when they clash, people choose
- History of who changed what
- Installable on a phone, in English and Brazilian Portuguese

## Stack

| Part | Choice |
| --- | --- |
| Web | Next.js (App Router), TypeScript, Tailwind CSS, next-intl |
| Sign-in | Better Auth |
| Database | PostgreSQL with Drizzle |
| Realtime | Socket.IO on its own Node server, fed by Postgres `LISTEN/NOTIFY` |
| Map | MapLibre GL, with data from OpenStreetMap |
| Landing page | Three.js, over the city's own terrain |
| Tests | Vitest and Playwright |
| Hosting | Docker Compose on an ARM server, published by GitHub Actions |

```
apps/web         Next.js app
apps/realtime    Socket.IO server
packages/core    Domain types and rules, shared by both apps
packages/db      Schema, migrations and the only code that changes a trip
infra            Containers
```

## How editing together works

Every change is a small operation, such as moving a stop or renaming a day. The screen applies it at once; the server checks it, applies it in a transaction, gives it the next revision of the trip and tells everyone. Browsers apply changes strictly in order, and fill any gap when they reconnect. Sending the same operation twice has no effect, so retrying is always safe.

Order inside a day is a fractional index: moving a stop changes one row, and two stops dropped on the same spot are told apart by the server.

| When | What happens |
| --- | --- |
| Two people edit different fields | Both survive: only changed fields travel |
| Two people edit the same field online | The last to arrive wins, and the other is told |
| An offline edit meets a newer one | The newer stays; the author sees both and chooses |
| Someone edits a deleted stop | The deletion wins, with an undo |
| Someone is removed | Their screen closes at once |

A conflict-free replicated data type would be more than this needs: an itinerary is a list of structured records, and these rules are easy to follow and to query.

## Run it locally

You need Node 22 or newer and pnpm. Docker is not required: `db:dev` starts a real Postgres from an npm package.

```bash
pnpm install
cp .env.example .env     # fill it in
pnpm db:dev              # keep running in its own terminal
pnpm db:migrate
pnpm dev
```

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @tripforge/web exec playwright install chromium   # once
pnpm test:e2e
```

The end-to-end tests replace every outside service with a local stand-in, and use two browsers at once for live editing.

## Credits

Map by [OpenFreeMap](https://openfreemap.org) and [OpenMapTiles](https://openmaptiles.org), data from [OpenStreetMap](https://www.openstreetmap.org/copyright). Place search by [Photon](https://photon.komoot.io), routes by [OSRM at FOSSGIS](https://routing.openstreetmap.de), relief from Mapzen and NASA SRTM.

## License

Source-available under the [PolyForm Strict License 1.0.0](LICENSE): you may read the code and use it for noncommercial purposes, but not change it, redistribute it or use it commercially.
