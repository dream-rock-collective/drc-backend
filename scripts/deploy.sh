#!/usr/bin/env bash
set -euo pipefail

git pull
bun run migrations
docker compose up -d --build
