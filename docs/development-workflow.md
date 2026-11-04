# Development workflow

## Development modes

For substantial features, architecture changes, or multi-file implementations
without a specified mode, ask: “Would you like to build this in chunks
(structure → scaffolding → implementation) or one-shot?” Small fixes,
straightforward refactors, and minor edits proceed normally. A request to
complete the implementation selects one-shot; explicit chunks, scaffolding,
step-by-step work, or pair programming select chunked mode. Honor an existing
choice without asking again. The choice applies only to the current task.

In one-shot mode, finish the authorized scope, run relevant checks, and report
results without routine stage approvals. In chunked mode, agree a short sequence
of responsibilities first. Complete one small, reviewable responsibility through
the stages below before starting another; do not scaffold an entire feature
across database, API, and UI at once.

## Chunked stages

1. **Structure:** Inspect affected code and reusable modules. Propose the smallest
   file tree, marking new and modified files, and explain responsibilities,
   dependencies, and data-flow direction. Once agreed, create only the agreed
   empty files or responsibility comments. Keep existing behavior functional.
   Stop for structure approval and a request to make the scaffolding.
2. **Scaffolding:** Establish only the current unit's types, signatures,
   imports/exports, and minimal call flow. Prefer functions; justify classes by
   actual state or existing patterns. No business logic or fabricated success:
   unfinished leaf functions throw a clear `Not implemented` error. Keep stubs
   disconnected from working entrypoints where possible. Present contracts,
   inputs/outputs, side effects, error paths, and unfinished functions. Run
   practical structural checks and disclose temporary failures. Stop for approval
   before implementing behavior.
3. **Implementation:** Briefly explain the unit's role and callers, then implement
   one meaningful function or tightly coupled responsibility. Add focused checks
   for non-trivial behavior and run relevant verification. Explain the result,
   error handling, and remaining limits. Stop for review before the next unit;
   describe its scope without starting it.

Structure approval alone does not authorize scaffolding. Scaffolding approval
authorizes the first agreed implementation unit, not all remaining units.
“Next chunk” advances one checkpoint. Corrections steer the current work without
restarting the process; “finish the rest” switches remaining work to one-shot.
After the final unit, verify integrated behavior. Never mark user review complete
without user input.

## Persistent task state

Use `docs/plans/active/<task>.md` only when multi-step work needs persistent state.
Record decisions, completed/incomplete steps, blockers, and next actions. Read
only the current task's plan; do not use agent instructions or indexes as logs.
On completion, delete disposable plans or move useful history to
`docs/plans/archive/` with a status note, updating links. Create directories only
when needed. Promote enduring decisions to authoritative references instead of
copying them into plans. Historical plans do not override current guidance.

## Verification

Run commands from this repository. For TypeScript changes use `bun run typecheck`;
for admin UI integration use `bun run build`. `bun run lint` checks CSS and types;
`bun run format <file>` formats files with Prettier. Enable the pre-commit hook
with `bun run setup-hooks`; it formats and re-stages staged files, rejects
partially staged files, and runs lint.
Use focused tests or a small assert-based check for new non-trivial logic.
Run `bun run test` for all Bun unit tests and `bun run test:e2e` for the
Playwright browser tests. Browser tests start their own frontend server and
mock API responses; install Chromium with `bunx playwright install chromium`
before the first run. Name browser tests `*.e2e.ts` so Bun's unit-test
discovery does not run them.

`bun run smoke-api` exercises a running API with a seeded administrator and
creates/edits test registrations. Inspect its setup and use a disposable local
database; it is not a read-only health check. Review affected UI at desktop and
mobile sizes when changing it. Do not run migrations, seed accounts, or destroy
volumes merely to validate documentation changes.

For setup, deployment, and explicit forward-only migrations, use the
[repository README](../README.md). Report checks actually run and any limitations.
