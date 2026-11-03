# Agent entry point

## Working scope

Keep changes focused and preserve unrelated local edits. Check repository status
before editing. Identify affected callers, tests, fixtures, and configuration;
update the authoritative docs when documented behavior or conventions change.

For substantial features, architecture changes, or multi-file implementations
without a specified mode, ask whether to work in chunks or one-shot. Honor an
existing task choice; small fixes and straightforward refactors proceed normally.
Explicit requests to finish the implementation select one-shot. Chunked work
requires review at each stage and implementation unit; see the workflow below.

## Selective references

Identify affected code first. Read only relevant sections, following a known
reference directly or using the documentation index when needed. Links are
navigation, not automatic imports. Do not preload all docs or reread unchanged
guidance during the same task.

- TypeScript implementation or refactoring → [TypeScript](docs/typescript.md)
- Mode selection, chunk stages, verification, or persistent task state →
  [Workflow](docs/development-workflow.md)
- API behavior and setup → [README](README.md) and
  [public API reference](docs/registration-site-api.md)
- API/admin structure → existing source modules; the old
  [architecture proposal](docs/architecture.md) is historical
- Other guidance → [Documentation index](docs/README.md)

## Documentation maintenance

Search for an existing authoritative reference before creating a document.
Keep stable conventions separate from task state and historical proposals;
remove obsolete rules instead of appending exceptions for one-off mistakes.
Update links and indexes when moving or deleting documents. Do not create a
summary after every task or use this file as a task log. Use an active plan only
when persistent state is useful, following the workflow's lifecycle.

Prefer existing automated checks over prose enforcement; document only commands
that exist here. Keep agent configuration minimal and references conditional.
