# TripForge

A collaborative trip planner: a group builds the itinerary day by day, together and in real time, with every stop on a map.

> **Status:** foundation (phase 0). Sign-in, languages, the database schema and the authenticated realtime server are in place. Trips, the map and live editing come next.

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
packages/core    Domain types and the realtime token, shared by both apps
packages/db      Drizzle schema, migrations and database client
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

## How sockets are authenticated

The web app exchanges the session cookie for a JWT that lasts five minutes (`GET /api/realtime-token`). The realtime server accepts a connection only with that token, closes the socket when it expires, and lets the client extend it with `session.renew`, for the same user only.

## Deploy

Every push to `main` runs the checks and boots the full Compose stack on an ARM runner. If the repository variable `DEPLOY_ENABLED` is `true`, it also publishes the images to GHCR and updates the server over SSH.

On the server, once: install Docker, open ports 80 and 443, create `/opt/tripforge` owned by the deploy user, and save `infra/.env.example` there as `.env` with real values. The GHCR packages must be public, or the server must be logged in to GHCR.

Repository secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` (the output of `ssh-keyscan` for the host, checked against the server).

## License

Source-available under the [PolyForm Strict License 1.0.0](LICENSE): you may read the code and use it for noncommercial purposes, but not change it, redistribute it or use it commercially.
