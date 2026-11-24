#!/bin/sh
# Saves the database to /backups, checks the file, sends a copy away and drops old ones.
set -eu

keep_days="${BACKUP_KEEP_DAYS:-14}"
name="tripforge-$(date -u +%Y%m%d-%H%M%S).dump"
part="/backups/.$name.part"
trap 'rm -f "$part"' EXIT

pg_dump --format=custom --file="$part"
# A dump that cannot be listed cannot be restored either.
pg_restore --list "$part" > /dev/null
mv "$part" "/backups/$name"
echo "Saved $name ($(wc -c < "/backups/$name") bytes)"

if [ -n "${BACKUP_UPLOAD_URL:-}" ]; then
  curl --fail --silent --show-error --retry 3 --upload-file "/backups/$name" "${BACKUP_UPLOAD_URL%/}/$name"
  echo "Sent $name"
else
  echo "BACKUP_UPLOAD_URL is empty: this copy stays only on this machine"
fi

find /backups -name 'tripforge-*.dump' -mtime "+$keep_days" -delete
