FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@12.8.1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# Realtime server, plus the migration script that runs before each deploy.
FROM node:24-bookworm-slim AS server
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /repo/apps/realtime/dist/main.mjs ./
COPY --from=build /repo/packages/db/dist/migrate.mjs ./
COPY --from=build /repo/packages/db/migrations ./migrations
USER node
EXPOSE 3001
CMD ["node", "main.mjs"]

# Daily copy of the database, at six in the morning UTC.
FROM postgres:16-alpine AS backup
RUN apk add --no-cache curl
COPY infra/backup/backup.sh infra/backup/restore.sh /usr/local/bin/
RUN echo '0 6 * * * /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1' > /etc/crontabs/root && mkdir /backups
VOLUME /backups
ENTRYPOINT []
CMD ["crond", "-f", "-l", "8"]
