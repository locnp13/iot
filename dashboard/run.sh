#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! docker info >/dev/null 2>&1; then
  echo "Docker doesn't seem to be running. Start Docker Desktop and try again." >&2
  exit 1
fi

docker compose up --build -d

echo "Waiting for the dashboard to respond..."
until curl -sf http://localhost:3010/ >/dev/null 2>&1; do
  sleep 1
done

echo "Dashboard is up: http://localhost:3010"
docker compose logs -f app
