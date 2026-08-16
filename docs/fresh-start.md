  docker compose down -v
  docker compose build backend
  docker compose up -d --wait postgres
  docker compose run --rm backend bun run migrations
  docker compose run --rm backend bun run seed-admin
  docker compose up -d backend
