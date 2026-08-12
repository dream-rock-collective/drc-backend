# Dream Rock Collective Admin SPA Migration Plan

## Summary

Replace the current Hono server-rendered Basic-Auth admin page with a React/Vite SPA while retaining Hono as the backend and postgres.js for database access.

The migration is incremental:

1. Add migration tooling and the target baseline schema.
2. Add Better Auth, generated auth schema, admin seeding, and session middleware.
3. Modernize the public and authenticated APIs.
4. Remove the old Basic-Auth/server-rendered admin implementation.
5. Add the React admin SPA, localStorage disaster-recovery mirror, export, and edit/delete controls.
6. Serve the built SPA from Hono on the same origin.
7. Update Docker/deployment and verify the complete flow from an empty database.

## Key decisions

- Keep Zod for runtime JSON validation because `ts-pattern` does not provide object-schema validation.
- Use integer registration IDs, matching the target architecture.
- Treat the baseline as fresh-install only; do not automatically transform legacy production data.
- Use postgres.js as the application database client and the supported Better Auth PostgreSQL integration.
- Seed the single admin account with an explicit, idempotent `bun run seed-admin` command.
- Use `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BETTER_AUTH_SECRET`, and the Better Auth base URL configuration.
- Use Vite’s development server with a proxy to Hono; production serves the built SPA from Hono.
- Use inline row editing rather than a modal.
- Use handwritten CSS and no component library.
- Use an explicit deployment flow: `git pull`, `bun run migrations`, then `docker compose up -d --build`.

## Implementation changes

### Database and migrations

- Add `migrations/0001_baseline.ts` for the registrations table.
- Add Better Auth’s generated schema as a later migration.
- Add `scripts/run-migrations.ts` and `bun run migrations`.
- Create and maintain `schema_migrations`.
- Run each migration and its tracking insert transactionally, in filename order.
- Skip applied migrations and provide no rollback support.
- Remove `docker/init.sql` and its Compose mount.

### Authentication

- Mount Better Auth at `/auth/*`.
- Use database-backed sessions and secure HTTP-only cookies.
- Disable public signup and support one seeded admin account.
- Add session/user context middleware for protected Hono routes.
- Remove Basic Auth and `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

### Backend API

- Replace `POST /api/registrations` with `POST /register` and require `address`.
- Add authenticated `GET /registrations`, returning active and soft-deleted rows.
- Add authenticated `POST /modify-registration` for partial edits and soft deletes.
- Make `GET /health` execute `SELECT 1`, returning 200/503 as appropriate.
- Preserve public registration-site CORS while avoiding unnecessary same-origin admin CORS.

### React SPA

- Add `/login` and `/` routes.
- Implement Better Auth sign-in, logout, and protected-route behavior.
- Add the registrations table with ID, name, email, address, and created columns.
- Read `dreamrock:registrations` immediately on page load, then replace it with one fresh API response.
- Keep deleted records in state/localStorage but hide them from the table.
- Add client-side JSON export of the complete cached dataset.
- Add inline edit and confirmation-based delete controls that patch local state without refetching.
- Style with handwritten CSS.

### Production and deployment

- Configure Hono to serve the Vite build and fall back to `index.html` for SPA routes.
- Keep `/auth/*` and API routes owned by Hono.
- Update Docker to build and serve the frontend.
- Add an explicit deployment script and update environment/deployment documentation.

## Test plan

Verify with a fresh Postgres database:

- Migration creation and idempotence.
- Better Auth schema and idempotent admin seeding.
- Login, logout, invalid credentials, and persistent sessions.
- Unauthorized and authorized registration endpoints.
- Address validation and lowercased email behavior.
- Health success and database-failure responses.
- Partial edits, soft deletes, and deleted-row retention.
- LocalStorage caching, hidden deleted rows, and complete JSON export.
- React route fallback after a production build.
- Docker rebuild from an empty database.

## Explicit non-goals

- Stripe integration.
- Restoring a database from exported JSON.
- Multiple-admin management, invitations, or password reset.
- Polling or real-time updates.
- Migration rollback support.
