# TripForge

A collaborative trip planner: a group builds the itinerary day by day, together and in real time, with every stop on a map.

> **Status:** phase 2 of 4. Accounts, trips, the day-by-day itinerary, the map with street routes, place search and invites work. Live editing comes next.

## Stack

| Part | Choice |
| --- | --- |
| Web | Next.js (App Router), TypeScript, Tailwind CSS |
| Languages | next-intl, English and Brazilian Portuguese |
| Sign-in | Better Auth with email and password |
| Database | PostgreSQL 16 with Drizzle |
| Realtime | Socket.IO on its own Node server |
| Tests | Vitest and Playwright |
| Hosting | Docker Compose and Caddy on one ARM VM |

## Layout

```
apps/web         Next.js app
apps/realtime    Socket.IO server
packages/core    Domain types, operations and the realtime token, shared by both apps
packages/db      Drizzle schema, migrations and the only code that changes a trip
infra            Dockerfile, Compose file and Caddyfile
```

## Run it locally

You need Node 22 or newer and pnpm. Docker is not required: `db:dev` starts a real Postgres 16 from an npm package.

```bash
pnpm install
cp .env.example .env     # fill in the two secrets
pnpm db:dev              # keep running in its own terminal
pnpm db:migrate
pnpm dev                 # http://localhost:3000
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @tripforge/web exec playwright install chromium   # once
pnpm test:e2e
```

## How a trip changes

Every change is a small operation (`item.move`, `item.update`, `day.update`...). The screen applies it at once and sends it; the server locks the trip, checks the role, applies it, gives it the next revision and logs it, all in one transaction. Each operation carries an id, so a retry is never applied twice. Order inside a day is a fractional index: moving a stop changes one row, and the server separates two stops dropped on the same spot.

## Outside services

All of them are free, need no key and can be replaced with an environment variable.

| What | Default | Variable |
| --- | --- | --- |
| Map | [OpenFreeMap](https://openfreemap.org) | `MAP_STYLE_URL` |
| Place search | [Photon](https://photon.komoot.io) | `PHOTON_URL` |
| Street routes | [OSRM at FOSSGIS](https://routing.openstreetmap.de) | `ROUTING_URL` (`off` draws straight lines) |
| Relief | [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | `TERRAIN_URL` |
| Email | none, so password recovery is off | `SMTP_URL`, `MAIL_FROM` |

The public Photon and OSRM servers are run on goodwill: searches are cached and limited per person, and routes go through one queue of at most one request a second and are stored forever. Host your own, or pay for one, before charging anyone.

## How sockets are authenticated

The web app exchanges the session cookie for a JWT that lasts five minutes (`GET /api/realtime-token`). The realtime server accepts a connection only with that token, closes the socket when it expires, and lets the client extend it with `session.renew`, for the same user only.

## Deploy

Every push to `main` runs the checks and boots the full Compose stack on an ARM runner. If the repository variable `DEPLOY_ENABLED` is `true`, it also publishes the images to GHCR and updates the server over SSH.

On the server, once: install Docker, open ports 80 and 443, create `/opt/tripforge` owned by the deploy user, and save `infra/.env.example` there as `.env` with real values. The GHCR packages must be public, or the server must be logged in to GHCR.

Repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` (the output of `ssh-keyscan` for the host, checked against the server).

## License

Source-available under the [PolyForm Strict License 1.0.0](LICENSE): you may read the code and use it for noncommercial purposes, but not change it, redistribute it or use it commercially.
