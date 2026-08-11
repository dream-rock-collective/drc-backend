# Admin API

## Run with Docker

From the repository root:

```sh
docker compose up --build
```

The API listens on `http://localhost:6942`.

## Create a registration

```sh
curl -X POST http://localhost:6942/api/registrations \
  -H 'Content-Type: application/json' \
  -d '{"name":"Leeya Appleby","email":"leeya@example.com"}'
```

The database currently stores only `name`, `email`, `id`, and `created_at`.
Additional form fields can be added to the schema and the SQL table later.
