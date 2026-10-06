#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/app/data}"

mkdir -p "$DATA_DIR"

if ! chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null; then
  echo "Warning: could not chown $DATA_DIR to $PUID:$PGID; ensure bind mount permissions allow writes." >&2
fi

exec su-exec "$PUID:$PGID" "$@"
