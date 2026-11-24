#!/bin/sh
# Puts a backup back, replacing what is in the database: restore.sh tripforge-....dump
set -eu

file="/backups/$(basename "${1:?Say which file to restore}")"
[ -f "$file" ] || { echo "There is no $file"; exit 1; }
pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --dbname="$PGDATABASE" "$file"
echo "Restored $(basename "$file")"
