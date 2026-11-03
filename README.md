# Dream Rock Collective admin site

See the [documentation index](docs/README.md) for engineering guidance and references.

Hono API and React admin SPA backed by PostgreSQL.

## Run with Docker

Create a `.env` file:

```env
POSTGRES_DB=collective_admin
POSTGRES_USER=admin
POSTGRES_PASSWORD=change-this-password
DATABASE_URL=postgres://admin:change-this-password@localhost:5432/collective_admin
REGISTRATION_SITE_ORIGIN=http://localhost:5173
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-admin-password
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://localhost:6942
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ONCE=price_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
```

Run the database, migrations, admin seed, and application explicitly:

```sh
docker compose up -d postgres
bun run migrations
bun run seed-admin
docker compose up -d --build
```

The API and admin SPA listen on `http://localhost:6942`.

Deployments use the same sequence through:

```sh
./scripts/deploy.sh
```

## Run locally

```sh
bun install
bun run migrations
bun run seed-admin
bun run dev
```

The fallback connection string is
`postgres://admin:admin@localhost:5432/collective_admin`. Set `DATABASE_URL`
to override it.

For frontend development, run the API and use `bun run frontend:dev`. Vite
proxies API and Better Auth requests to Hono.

## Public API

Create a registration with:

```sh
curl -X POST http://localhost:6942/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jordan Alvarez","email":"jordan@example.com","address":"123 Main St","birthday":"April 12"}'
```

`GET /health` performs a lightweight PostgreSQL check.

The public payment endpoints are:

- `POST /create-checkout-session` with `{ "userId": 42, "plan": "once" | "monthly" | "yearly" }`; returns the hosted Stripe Checkout URL.
- `POST /submit-allocation` with `{ "userId": "42", "allocation": { "charityKey": 5 } }`; stores an allocation submission for a paid registration.
- `POST /webhooks/stripe`; configure Stripe to send signed events here. The webhook records completed Checkout Sessions on the registration.

Checkout success returns to the registration site's `/allocate-payment/` page.
Allocation keys and totals are frontend-owned JSON; the backend validates only
the payload shape and that the registration has been paid.

Use Stripe test-mode keys and prices for local development. For local webhook
delivery, run `stripe listen --forward-to localhost:6942/webhooks/stripe` and
use the signing secret it prints as `STRIPE_WEBHOOK_SECRET`.

## Admin SPA

The React admin SPA is available at `http://localhost:6942/login`.

**Export CSV** opens a modal with payment-plan and column checkboxes. It exports
only active registrations matching the selected plans, with any combination of
Name, Email, Address, and Birthday. “No payment” means no plan; payment status
does not affect the filter. All options start selected. Successful exports save
the selection in this browser's local storage; Cancel discards changes. JSON
export is no longer available.

Authenticated API endpoints:

- `GET /registrations` returns active and soft-deleted records, including each
  registration's nullable plain-text `notes` field.
- `POST /modify-registration` edits records or soft-deletes them. Edit payloads
  may include `notes` (up to 5,000 characters); blank notes clear the field.

Migrations are forward-only and run explicitly with `bun run migrations`.
Docker does not initialize the schema automatically.

## Tests

Run `bun run test` for unit tests and `bun run lint` for CSS and TypeScript checks.
For modal browser tests, install Chromium with `bunx playwright install chromium`,
then run `bun run test:e2e`. These tests start their own frontend server and mock
the registration API; no database is required. `bun run smoke-api` checks a running
API with a seeded administrator and writes test registrations, so use a disposable
database.

The GitHub Actions **Tests** workflow runs on pull requests and every push to
`main`, including merges. It runs lint, unit tests, the frontend build, modal browser tests, and API
smoke tests against an isolated PostgreSQL service with test-only credentials.
