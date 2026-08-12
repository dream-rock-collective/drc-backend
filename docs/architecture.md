# Dream Rock Collective — Admin Architecture

**Status:** Design spec, ready for implementation
**Scope of this document:** the admin-site backend (Hono + Postgres) and the admin-site frontend (Vite + React) — both live in this document. The registration-site (separate repo) is out of scope beyond the two endpoints it calls (`POST /register`, `GET /health`); its own implementation isn't detailed here. It builds directly on top of the existing `admin-site` codebase (Hono app with `/health`, `/api/registrations`, `/admin`, and its `docker-compose.yml`).

---

## Table of Contents

1. [Project Overview & Goals](#1-project-overview--goals)
2. [System Overview](#2-system-overview)
3. [Current State](#3-current-state-what-already-exists)
4. [Data Model](#4-data-model)
5. [Migrations](#5-migrations)
6. [API Endpoints](#6-api-endpoints)
7. [Admin Frontend (Vite + React)](#7-admin-frontend-vite--react)
8. [Auth & Security](#8-auth--security)
9. [Non-Goals / Out of Scope](#9-non-goals--out-of-scope-this-phase)
10. [Implementation Chunks](#10-implementation-chunks)
11. [Open Decisions & Defaults](#11-open-decisions--defaults)

---

## 1. Project Overview & Goals

Dream Rock Collective runs a monthly mailing list where people sign up to receive art by mail. The system is split into two independently deployed repos:

- **registration-site** — public-facing, static, where people sign up. Vite + vanilla TypeScript, no framework, published to GitHub Pages.
- **admin-site** — private, where the collective's owner reviews and manages signups. Hono + Postgres backend on a home server behind a Cloudflare Tunnel, with a Vite + React frontend served from the same origin.

This phase of work:

- Replaces the current server-rendered, Basic-Auth-protected admin HTML page with a proper JSON API and a React single-page app.
- Adds a real `/health` endpoint the registration site can check once on page load before allowing a submission.
- Replaces the current ad hoc `docker/init.sql` schema seeding with a real migrations system.
- Renames `/api/registrations` to `/register`, and the edit/delete stretch-goal endpoint is now `/modify-registration`.

The guiding goal for `/registrations` is **resilience**: it returns the full JSON of every registration — including soft-deleted ones — so a client-side copy of every registrant's data can exist independent of the database. Actually rebuilding a database from that JSON is explicitly **out of scope** for this phase.

## 2. System Overview

- **registration-site** calls `POST /register` to create a signup, and `GET /health` once on page load to confirm the backend is reachable before allowing submission. No retry, no polling — a single check.
- **admin-site API** owns the `registrations` table in Postgres, exposes the authenticated `GET /registrations` read endpoint and `POST /modify-registration` write endpoint, issues auth sessions via Better Auth (`/auth/*`), and runs schema migrations from `/migrations`.
- **admin-site frontend** is a React SPA, served same-origin with the API (see [Section 11](#11-open-decisions--defaults)). It's an authenticated client of `/registrations` and `/modify-registration`, mirrors the last fetch into `localStorage`, and is styled with hand-written CSS — no component library.

## 3. Current State (what already exists)

The `admin-site` repo already has:

- `src/index.ts` — wires up `healthRoute`, `registrationsRoute`, and `adminRoute` on a single Hono app, with CORS scoped to `REGISTRATION_SITE_ORIGIN`.
- `src/db.ts` — a `postgres` (postgres.js) client, connection string from `DATABASE_URL`.
- `src/routes/registrations.ts` — `POST /api/registrations`, validates `{ name, email }` with Zod, inserts into a `registrations` table, returns the created row.
- `src/routes/admin/admin-route.ts` — `GET /admin`, protected by HTTP Basic Auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars), server-renders an HTML table of all registrations.
- `src/routes/admin/utils.ts` / `admin-html.ts` — HTML page-building helpers used by the admin route.
- `src/routes/health.ts` — `GET /health`, currently returns a static `{ status: "ok" }` with no real check behind it.
- `docker-compose.yml` — a `backend` service (port 6942, env: `DATABASE_URL`, `REGISTRATION_SITE_ORIGIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) and a `postgres` service that seeds its schema by mounting `./docker/init.sql` into `/docker-entrypoint-initdb.d/001-init.sql`.

**This phase removes:**
- Basic Auth (`admin-route.ts`'s middleware, and the `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars in `docker-compose.yml`).
- Server-rendered HTML (`admin-route.ts`'s page rendering, `admin-html.ts`, `utils.ts`'s HTML builder).
- `docker/init.sql` schema seeding — including its volume mount in `docker-compose.yml` — replaced entirely by the migrations system in [Section 5](#5-migrations).

**This phase keeps and extends:** the Zod validation pattern, the `postgres` client in `db.ts`, the Hono routing structure, the `backend` service in `docker-compose.yml` (with updated env vars — see [Section 8](#8-auth--security)).

## 4. Data Model

Since migrations are starting fresh (see [Section 5](#5-migrations)), there's no "current vs. target" schema split to reconcile — the baseline migration creates the table in its final v1 shape directly:

| column             | type        | notes |
|--------------------|-------------|-------|
| id                 | serial / pk | |
| name               | text, not null | |
| email              | text, not null | stored lowercased |
| address            | text, not null | |
| stripe_payment_id  | text, nullable | reserved — not wired up yet, shape TBD once Stripe is integrated |
| created_at         | timestamp, not null, default now() | |
| deleted_at         | timestamp, nullable | powers soft delete |

A row is "deleted" if `deleted_at is not null`. Nothing is ever hard-deleted from Postgres.

Better Auth also needs its own tables (user/session/account/verification, exact shape depends on its Postgres adapter) — these are a separate migration, not part of the `registrations` baseline. See [Section 11](#11-open-decisions--defaults) for how that schema gets generated.

**Note on existing production data:** the baseline migration builds this schema from scratch. If there's already data sitting in production under the old ad hoc `init.sql` schema, this migration won't carry it forward automatically — worth a manual export/reimport pass before cutting a live database over to the new migration system, since "start from scratch" wasn't stated as including a data-preservation requirement.

## 5. Migrations

Migrations are TypeScript scripts living in a `/migrations` folder at the repo root, run via a new `bun run migrations` command.

**File format:** each migration is a `.ts` file exporting an `up` function that runs against the same `postgres` client style already used in `db.ts` (tagged-template queries). Example shape:

```ts
// migrations/0001_baseline.ts
import type { Sql } from "postgres";

export const up = async (sql: Sql) => {
  await sql`
    CREATE TABLE registrations (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      address text NOT NULL,
      stripe_payment_id text,
      created_at timestamp NOT NULL DEFAULT now(),
      deleted_at timestamp
    )
  `;
};
```

**Naming/ordering:** numbered prefix, applied in filename order — `0001_baseline.ts`, `0002_better_auth_schema.ts`, `0003_...`, etc.

**Tracking applied migrations:** a `schema_migrations` table (`id serial pk`, `name text not null unique`, `applied_at timestamp not null default now()`), auto-created by the runner if it doesn't exist yet. Before running, the runner reads `/migrations`, sorts filenames, and skips any name already present in `schema_migrations`. For each new one, it runs the migration's `up(sql)` inside a transaction and then records the filename in `schema_migrations` — so a migration is only ever applied once per database, and re-running `bun run migrations` is always safe (a no-op if everything's already applied).

**Forward-only:** no `down()`/rollback support. If a migration needs undoing, that's a new forward migration that reverses the change, not a rollback script.

**Runner + command:** a small script (e.g. `scripts/run-migrations.ts`) does the directory scan / apply logic above, wired up in `package.json` as:

```json
{ "scripts": { "migrations": "bun run scripts/run-migrations.ts" } }
```

so `bun run migrations` does the whole thing.

**Deployment integration:** `docker-compose.yml`'s `./docker/init.sql:/docker-entrypoint-initdb.d/001-init.sql:ro` mount is removed — Postgres starts with an empty database, and `bun run migrations` is what builds it up. See [Section 11](#11-open-decisions--defaults) for exactly where in the deploy flow that command runs.

## 6. API Endpoints

All endpoints live directly off the root — **no `/api` prefix** anywhere, since the production domain is already `api.dreamrock.co` and a further `/api` segment would be redundant.

### 6.1 `POST /register`

Renamed from `POST /api/registrations`. Same behavior as today, plus the new **required** `address` field.

**Request:**
```json
{ "name": "Jordan Alvarez", "address": "123 Main St, Springfield", "email": "jordan@example.com" }
```

**Success — `201`:**
```json
{ "registration": { "id": 42, "name": "Jordan Alvarez", "email": "jordan@example.com", "address": "123 Main St, Springfield", "created_at": "2026-08-12T18:03:00.000Z" } }
```

**Validation error — `400`**, same shape as today (`{ error, fields }`). `address` is validated the same way `name` is (trimmed, non-empty, required) — a missing or blank `address` is a validation failure.

### 6.2 `GET /registrations`

**Requires authentication** (same session used across the admin API). Returns every registration, including soft-deleted ones, as a flat JSON array — the disaster-recovery mirror, so it's a complete dump, never filtered.

**Response — `200`:**
```json
{
  "registrations": [
    {
      "id": 42,
      "name": "Jordan Alvarez",
      "email": "jordan@example.com",
      "address": "123 Main St, Springfield",
      "stripe_payment_id": null,
      "created_at": "2026-08-12T18:03:00.000Z",
      "deleted": false
    },
    {
      "id": 41,
      "name": "Old Entry",
      "email": "old@example.com",
      "address": "456 Oak Ave",
      "stripe_payment_id": null,
      "created_at": "2026-07-01T09:12:00.000Z",
      "deleted": true
    }
  ]
}
```

`deleted` is a derived boolean (`deleted_at is not null`), not the raw timestamp. `401` if the session cookie is missing or invalid.

### 6.3 `POST /modify-registration` (stretch goal)

**Requires authentication.** Renamed from the earlier `/edit-registration` sketch. Discriminated request body by `type`:

**Delete:**
```json
{ "type": "delete", "id": "42" }
```

**Edit** (partial update — `data` only needs the fields being changed):
```json
{ "type": "edit", "id": "42", "data": { "name": "new name" } }
```

**Response — `200`:** both `delete` and `edit` return the resulting row, in the same shape as one entry in `/registrations` (a delete's response has `deleted: true`). Giving both branches the same response shape means the frontend handles the result one way regardless of which action was taken.

`404` if the id doesn't exist, `400` for an unrecognized `type`, a missing `id`, or (on `edit`) a `data` object that fails the same field-level validation as `/register` (e.g. an invalid email). `401` if unauthenticated.

Deleting sets `deleted_at = now()`; it never removes the row or clears its other fields, so an accidental delete is always recoverable directly in Postgres.

### 6.4 `GET /health`

**Public, no auth** — the registration site has to be able to call this before anyone has signed in.

Performs a real check: a lightweight `SELECT 1` against Postgres in addition to confirming the process itself is responsive. This matters because "the Hono process is running" and "registrations can actually be saved" are different failure modes, and the second one is the one that actually matters to a visitor filling out the form.

**Healthy — `200`:**
```json
{ "status": "ok" }
```

**Unhealthy — `503`:**
```json
{ "status": "error" }
```

Kept deliberately minimal — no uptime counters, version strings, or diagnostics. The registration site calls this exactly once, on initial page load; there's no retry banner and no polling on the client side, so this endpoint should expect low, one-shot-per-visit traffic.

### 6.5 Auth endpoints

Handled by Better Auth's own Hono handler, mounted at **`/auth/*`** — its own internal routing, distinct from this project's no-`/api`-prefix decision for the endpoints above. Better Auth owns everything under `/auth/*` (sign-in, sign-out, session-fetch); nothing there is hand-rolled. See [Section 8](#8-auth--security) for the account model.

## 7. Admin Frontend (Vite + React)

### Routes / pages

- `/login` — email + password form, posts to Better Auth's sign-in endpoint, redirects to `/` on success.
- `/` — the registrations table. Redirects to `/login` if there's no valid session (a `401` from `/registrations` triggers this).

### Data loading & the localStorage mirror

On mount:

1. Read the last-cached JSON from `localStorage` (key suggestion: `dreamrock:registrations`) and render the table immediately from it, if present — instant paint, and still shows *something* if the network request fails outright.
2. Fetch `GET /registrations`. On success, replace in-memory table state with the fresh data and overwrite the `localStorage` entry.
3. Refetching only happens on page load — no polling, no background refresh.

### Table

Columns: ID, Name, Email, Address, Created. Soft-deleted rows (`deleted: true`) are filtered out of the rendered table entirely — the UI only ever shows active registrations. The underlying `/registrations` JSON and the `localStorage` cache still include deleted rows (that's what makes them a real backup mirror); filtering happens purely in the table's rendering, never by dropping data from what's fetched/cached.

### Export button

Exports the **full** cached dataset — the same data held in `localStorage`, including any soft-deleted rows the table itself is hiding — as a downloadable `.json` file. `Blob` + a temporary `<a download>` element is the standard pattern; no server round-trip needed since the data's already in memory. This is deliberately the raw backup data, not just what's currently rendered.

### Edit / delete UI (stretch goal)

Per-row controls:

- **Edit** opens an inline form or modal (name/email/address), and on submit calls `POST /modify-registration` with `{ type: "edit", id, data }` — only the changed fields go in `data`.
- **Delete** is a confirm-then-submit action calling `POST /modify-registration` with `{ type: "delete", id }`.

Either way, the response (the updated row) is used to patch both in-memory state and the `localStorage` cache directly, rather than re-fetching the whole list.

### Styling

Hand-written CSS, no component library (no shadcn/ui or similar) — the visual design is being built by hand, deliberately.

## 8. Auth & Security

- **Library:** [Better Auth](https://better-auth.com), via its [Hono integration](https://better-auth.com/docs/integrations/hono). Better Auth owns session issuance, cookie handling, and CSRF concerns; the app reads `user`/`session` off the request context in middleware. Internal routes live under `/auth/*`.
- **Account model:** a single-admin tool, not a multi-user product. No public sign-up flow. The one admin account is seeded once (a small script that creates it from env-provided credentials) rather than exposing a registration endpoint. `docker-compose.yml`'s old `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars are replaced by whatever Better Auth's seed step needs (e.g. an admin email + password pair, plus Better Auth's own secret key env var). Better Auth supports more than one account if that's ever needed later, but nothing in this phase builds toward that.
- **Cookies:** `httpOnly`, `secure`, and `SameSite=Lax` are the right defaults *as long as the admin frontend and the API share an origin* (see [Section 11](#11-open-decisions--defaults)). If they end up on different subdomains, Better Auth's cross-subdomain cookie option needs to be turned on explicitly, or `SameSite=None; Secure` used instead.
- **CORS:** the existing `cors()` middleware scoped to `REGISTRATION_SITE_ORIGIN` stays as-is for the public `/register` and `/health` endpoints. The authenticated endpoints don't need permissive CORS at all if the admin frontend is same-origin with the API.

## 9. Non-Goals / Out of Scope (this phase)

- The registration-site's own implementation — it's just a consumer of `/register` and `/health` from this system's point of view.
- Actually rebuilding a Postgres database from the exported JSON — `/registrations` and the export button exist so the *data* survives, not so it can be one-click restored yet.
- Stripe integration — `stripe_payment_id` is reserved but not populated or validated this phase.
- Subscription/recurring billing.
- Multi-admin account management, invites, or password reset flows.
- Migration rollback/`down()` scripts.
- Any polling/real-time updates anywhere in the system.

## 10. Implementation Chunks

Ordered so each chunk is a coherent, independently reviewable unit of work, and so later chunks can rely on earlier ones (migrations and auth come first since almost everything else depends on them).

1. **Migration tooling + baseline schema.** Build the `/migrations` runner (`bun run migrations`, `schema_migrations` tracking table, the TS-script format), write `0001_baseline.ts` creating the `registrations` table per [Section 4](#4-data-model), and remove `docker/init.sql` plus its volume mount from `docker-compose.yml`.
2. **Auth foundation.** Install and configure Better Auth with its Hono integration under `/auth/*`, generate/write its schema migration, seed the single admin account, add the session-check middleware, remove the old Basic Auth middleware and env vars.
3. **`/register` + real `/health`.** Rename `POST /api/registrations` to `POST /register`, require `address`. Add the `SELECT 1` DB check to `/health`, returning `503` + `{status: "error"}` on failure.
4. **`GET /registrations`.** Authenticated JSON dump endpoint per [6.2](#62-get-registrations). Remove the old server-rendered HTML admin page and its helpers (`admin-html.ts`, the HTML-building parts of `utils.ts`).
5. **Admin frontend scaffold.** New Vite + React app: login page, protected table route (deleted rows filtered from render), the localStorage-mirror data-loading pattern, the export button, hand-written CSS.
6. **`POST /modify-registration` + edit/delete UI.** Backend endpoint per [6.3](#63-post-modify-registration-stretch-goal), plus the per-row edit/delete controls in the admin table.

## 11. Open Decisions & Defaults

| Decision | Default chosen here | Why |
|---|---|---|
| Admin frontend hosting | Same origin/process as the API (Hono serves the built React static files), not a separate subdomain | Avoids cross-site cookie configuration entirely; simplest secure default for a single-admin tool |
| Where `bun run migrations` runs during deploy | An explicit step in the existing SSH deploy flow — right after `git pull`, before `docker compose up -d --build` — rather than the container auto-running migrations on every boot | Keeps schema changes a visible, deliberate step instead of something that silently happens on every restart |
| Better Auth's own schema | Generate it via Better Auth's own CLI/migration tooling if it provides one, saved into `/migrations` alongside the hand-written ones, rather than hand-writing its tables | Better Auth's internal schema can change between versions; its own generator stays in sync automatically |
