# Dream Rock Collective backend

The backend API for the Dream Rock Collective registration site. It consists
of a Hono API and a PostgreSQL database.

## Run with Docker

From the repository root, create a `.env` file with the PostgreSQL settings
used by `docker-compose.yml`, then run:

```sh
docker compose up --build
```

The API listens on `http://localhost:6942`.

## Run locally

Install dependencies with Bun and start the API directly:

```sh
bun install
bun run dev
```

The local fallback connection string is
`postgres://admin:admin@localhost:5432/collective_admin`. Set `DATABASE_URL`
to override it.

## Create a registration

```sh
curl -X POST http://localhost:6942/api/registrations \
  -H 'Content-Type: application/json' \
  -d '{"name":"Leeya Appleby","email":"leeya@example.com"}'
```

The database currently stores only `name`, `email`, `id`, and `created_at`.
Additional form fields can be added to the schema and the SQL table later.

## Admin page

The server-rendered admin page is available at
`http://localhost:6942/admin`. It currently has no authentication and displays
the saved registrations; authentication should be added before exposing this
route publicly.
