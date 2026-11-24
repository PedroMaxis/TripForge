#!/bin/sh
# Runs on the server, sent by the deploy: update.sh <commit> <registry user>, token on stdin.
set -eu
cd /opt/tripforge
export TAG="$1"

# A login of its own, gone at the end, so nothing is left behind on the machine.
DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io -u "$2" --password-stdin

docker compose pull
docker compose up -d --remove-orphans
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile

# Only this app's own images, and only the ones no longer in use.
docker images --format '{{.Repository}}:{{.Tag}}' 'ghcr.io/pedromaxis/tripforge-*' |
  grep -v -e ":$TAG\$" -e ':latest$' | xargs -r docker rmi > /dev/null 2>&1 || true
