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
bun run setup-hooks
bun run migrations
bun run seed-admin
bun run dev
```

The fallback connection string is
`postgres://admin:admin@localhost:5432/collective_admin`. Set `DATABASE_URL`
to override it.

For frontend development, run the API and use `bun run frontend:dev`. Vite
proxies API and Better Auth requests to Hono.

Run `bun run setup-hooks` once per clone to enable the pre-commit hook. It formats
staged files with Prettier, re-stages them, and runs `bun run lint`. Partially
staged files are rejected so unstaged edits cannot be included accidentally.
To format a file manually, run `bun run format src/client/ContentEditor.tsx`.

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
all data columns shown in the registration table, including Plan. Allotments
are exported as JSON. “No payment” means no plan; payment status
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

## Site content publishing

The content editor uses `content/initial-page.json` in an existing registration-site
checkout. Configure the `SITE_*` settings in `.env.sample`; no Git credentials are
sent to the browser. The checkout is provisioned by the operator, not cloned by
an HTTP request. It must be outside the backend repository.

`SITE_PUBLISH_MODE=local` writes the JSON atomically without committing or accessing
any remote. `SITE_CHECKOUT_PATH=../registration-site` works for adjacent local
repositories. Compose mounts that host path at `/site` and sets the container's
checkout path automatically.

For `remote`, clone a dedicated registration-site checkout and check out
`SITE_PUBLISH_BRANCH`. Set its fetch and push origin to exactly `SITE_REPOSITORY`.
Set `SITE_GIT_NAME` and `SITE_GIT_EMAIL`. The publisher fetches that existing branch,
fast-forwards only, and commits only the content document. It rejects untracked,
staged, modified, or diverging files. Do not use your development checkout for
remote publishing. A push to `main` triggers the site's existing Pages workflow;
a successful push does not mean deployment has finished.

Create a repository-scoped SSH deploy key with write access. Store its private key
outside either repository with restrictive permissions. Populate a known-hosts
file after verifying the server's host-key fingerprint through a trusted channel.
Set `SITE_DEPLOY_KEY_PATH` and `SITE_KNOWN_HOSTS_PATH` to those files. SSH uses only
that key, requires matching known hosts, and never prompts. For Compose, use:

```sh
docker compose -f docker-compose.yml -f compose.site-ssh.yml up -d --build
```

The optional overlay mounts both SSH files read-only. Ensure the container user
can read them and write the checkout; never commit keys or put them in the image.
HTTPS repositories can use host-provisioned Git credentials, but must not embed
credentials in the repository URL. Explicit local repository paths are supported
for isolated integration tests.

Edits carry the SHA-256 revision of the loaded file. A changed file blocks publishing
until the editor reloads and reviews the newer version. Publishing operations are
serialized within the process. Remote mode uses a checkout `.git/site-publisher.lock`
directory shared by processes and containers. Local mode uses a host temporary-
directory lock; use one local-mode container per checkout.

If a push fails, the commit and `.git/site-publisher-pending.json` remain for retry.
Retry the same content before making further edits. The publisher verifies the
pending commit before pushing it; it never force-pushes. If the remote advanced,
reconcile manually while preserving the draft. An interrupted commit or corrupted
pending marker requires operator inspection; no automatic reset discards work.
After confirming no publisher process is running, a stale
`.git/site-publisher.lock` (remote) or
`/tmp/drc-site-publisher-<checkout-sha256>.lock` (local) directory can be removed manually.

Run focused publisher tests with `bun test tests/site-publishing.test.ts`.

### Content editor API

The admin editor uses the existing administrator session. All content responses
have `Cache-Control: no-store` and require authentication:

- `GET /api/site-content` returns `{ content, revision, mode, pending, draftKey }`.
  `draftKey` scopes browser drafts to the configured checkout and signed-in user.
- `GET /api/site-content/images` returns `{ images: string[] }`, containing
  eligible root-relative paths from the site's existing `public/` assets.
- `POST /api/site-content/publish` accepts `{ content, revision }` and returns the
  updated snapshot, with `commit` when a Git commit was pushed. A successful push
  does not confirm that GitHub Pages deployment has finished.

Publishing requires `Content-Type: application/json`, a request `Origin` equal to
the origin in `BETTER_AUTH_URL`, and a body no larger than 512 KB. Set
`BETTER_AUTH_URL` to the URL used to open the admin, including when using the Vite
development proxy. Missing sessions return 401, wrong origins 403, invalid copy
400, stale revisions 409, and a busy publisher 423. The browser must keep its
draft when publication fails and reload/review newer copy before retrying a
conflict. A pending failed push may only retry the same content.

The backend loads the registration site's authoritative `src/content.ts`
validator from the operator-configured checkout, after synchronizing it. Keep
that checkout trusted and deploy the matching site code before enabling editing.
Section images must exist as regular files under `public/`; symlinks and paths
outside that directory are excluded. No arbitrary filesystem path is accepted
from an API request.

Run content-boundary tests with `bun test tests/site-content.test.ts`.

### Live preview

Install the registration site's locked dependencies in `SITE_CHECKOUT_PATH`
with `bun install --frozen-lockfile`. The backend runs that checkout's Vite
preview build; it never installs dependencies automatically. The editor requests
`GET /api/site-preview` with its administrator session and receives an isolated
iframe URL and a frame token. Reload the editor after changing
site code or images. Source/configuration/assets are fingerprinted and unchanged
builds are reused; typing sends browser messages without rebuilding.

The preview uses the site's real renderer and CSS, with registration and payment
actions disabled and no member-storage initialization. Its iframe permits
scripts without same-origin access. HTML requires authentication; only
allowlisted generated JS, CSS, fonts, and images are served anonymously with
CORS so the opaque iframe can load them. CSP forbids connections, form
submissions, and embedding by other origins. Frame messages check parent/frame
identity, origin, and token. Preview builds live under the backend's temporary
directory; only the last three distinct source builds are retained.

See [the content editor guide](docs/content-editor.md) for the complete editing
and publishing workflow. Verify preview hosting with
`bun test tests/site-preview.test.ts`.

For authenticated editor browser verification, `compose.editor-test.yml` defines
an isolated PostgreSQL service with temporary in-memory storage. Start it with
`docker compose -p drc-editor-test -f compose.editor-test.yml up -d --wait`.
Its local connection string is
`postgres://editor_test:editor_test_only@127.0.0.1:55481/drc_editor_test`.
Run migrations and seed an administrator with that explicit `DATABASE_URL` and
test-only `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BETTER_AUTH_SECRET`, and
`BETTER_AUTH_URL`; use those same environment values for the backend. Point
`SITE_CHECKOUT_PATH` at a disposable copy of registration-site. Stop only this
fixture with `docker compose -p drc-editor-test -f compose.editor-test.yml down`.
Do not combine the fixture with the application Compose file or use production
credentials. Its data is discarded when the test container stops.
