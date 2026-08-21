#!/usr/bin/env bash
set -euo pipefail

git pull
docker compose up -d postgres
docker compose build backend
docker compose run --rm backend bun run migrations
docker compose run --rm backend bun run seed-admin
docker compose up -d backend
