#!/usr/bin/env bash
set -euo pipefail

echo "Stopping the Dream Rock stack…"
docker compose down

echo "Rebuilding the backend image…"
docker compose build --no-cache backend

echo "Starting PostgreSQL…"
docker compose up -d postgres

echo "Running database migrations…"
docker compose run --rm backend bun run migrations

echo "Seeding the admin account…"
docker compose run --rm backend bun run seed-admin

echo "Starting the backend…"
docker compose up -d backend

echo "Dream Rock stack rebuilt and running."
