# Content editor implementation

## Agreed execution

Work on both existing `editor` branches. Chunks 1 and 2 run in parallel with
subagents; integrate and verify both before chunk 3, then complete chunk 4.
The primary agent coordinates contracts and integration; subagents implement and
review focused responsibilities. No routine intermediate approval stops.

- [x] 1. Git publisher: backend service, local/remote configuration, SSH/container setup, tests.
- [x] 2. Initial-page JSON conversion: registration-site agent; see its matching plan.
- [x] 3. Authenticated admin editor and publish endpoints.
- [x] 4. Isolated backend-hosted live preview.

## Shared contracts and decisions

Content lives at `content/initial-page.json` in the configured site checkout.
Sections are ordered `{ title, body, image? }` entries with no IDs/types. Bodies
use restricted paragraphs, lists, emphasis, and links; FAQs use the same format.
Images select existing assets and carry alt text; uploads are v2. All initial-page
copy is editable, but form field names, API payloads, and validation stay fixed.

`src/site-publishing.ts` owns `readSiteConfig`, `readSiteContent`, and
`publishSiteContent(content, revision, config?)`. Reads return
`{ content, revision, mode, pending }`; publishing may also return `commit`.
Revision is SHA-256 of exact file bytes. Routes validate content before publishing.
`SitePublishError.status` supplies safe HTTP status codes. Failed pushes preserve
a pending commit; retry only identical content with its original/current revision.

## Chunk 1: completed

- Explicit env configuration, atomic local writes, fixed safe file destination.
- Dedicated clean remote checkout, exact origin/branch validation, FF-only sync.
- Content-only commits, no force pushes, pending-push recovery checks.
- In-process queue and checkout-shared remote lock (host-local temporary lock in local mode).
- SSH key and pinned known-hosts, container Git, optional SSH mounts documented.
- Focused tests use disposable repositories and bare remotes; no production push.

Verification: `bun test tests/site-publishing.test.ts`: 13 passed (40 assertions).
`bun run typecheck`, `bun run build`, and `git diff --check` pass after dependency
installation. Safety review added UUID temporary filenames and a regression test
for preserving pre-existing operator temporary files. Root coordinates Docker and
browser verification using `compose.editor-test.yml`. Chunk 2 desktop/mobile
visuals and a local mock registration flow have passed root verification.

## Chunk 3: completed

API complete: authenticated read/image-list/publish routes, configured-origin
publication checks, 512 KB JSON request limit, shared checkout validator, existing
asset validation, revision conflicts, and user/checkout-scoped browser draft key.
`bun test tests/site-content.test.ts`: 12 tests pass. Admin UI and browser
integration are being completed separately before marking this chunk done.

UI implemented: separate `/editor` page and dashboard navigation, per-user/site
browser drafts, plain text fields, rich text controls, section add/remove/reorder,
existing-image picker and alt text. Rich editing normalizes browser markup into
the restricted body format and pastes plain text. The server remains authoritative.
Stale drafts retain their original revision and require an explicit newer-content
review before rebasing. Publication errors preserve drafts; pending Git pushes
can be retried before editing resumes. Unpublished changes warn before navigation.

`bun test tests/content-editor.test.ts`: 5 tests / 21 assertions pass for draft
validation, scoped storage, revision preservation, nested copy edits, ordering,
and link safety. Typecheck, CSS lint, production build and diff checks pass.
Root verified real sign-in against the disposable database, content/image reads,
browser draft persistence, native text input, rich-text bold normalization, and
local publication against `/tmp/drc-editor-site`. The published JSON contains the
edited title and safe rich HTML. Browser automation required native input events;
an immediate post-click assertion raced publication, and the resulting file was
checked to confirm success. Further browser calls are intentionally limited at
the user's request. Final preview/mobile acceptance remains in chunk 4.

## Chunk 4: completed

Build and serve the actual site preview through the backend. Sandbox iframe with
`allow-scripts` only. Parent validates iframe source and opaque/null origin;
child validates parent source/origin. Update draft content through messages and
the shared renderer, with desktop/mobile widths. Disable submissions, payment,
navigation, member storage, and registration requests in preview. Display build
failures and refresh assets when site code changes. Test message boundaries and
side effects; compare with published build using agent-browser.

Implemented authenticated preview builds with source fingerprints, generated-file
allowlisting, public CORS assets for the opaque iframe, restrictive CSP, explicit
parent/frame/token message validation, and disabled form/navigation behavior.
The editor embeds the real renderer/CSS and reports build/render errors while
preserving the last valid page. Preview builds do not install dependencies.

Final verification: backend `bun test` passes 37 tests / 147 assertions; site
passes 12 tests / 54 assertions. Both lint and production builds pass; backend
typecheck, site preview build, and diff checks pass. The preview CLI output is
separate (`dist-preview`) so it cannot erase production `dist` output.
Docker build passes; the image includes Git/SSH and excludes `.env`.

Root's compact agent-browser integration check used real disposable auth and
the actual preview build. The iframe acknowledged a live title edit with its
expected opaque origin/token, used `allow-scripts` only, and left published JSON
unchanged. The desktop screenshot was inspected; desktop 1280px and mobile 390px
had no horizontal overflow or preview errors. Browser coverage was deliberately
kept short at the user's request. No production GitHub push or Pages deployment
was performed; bare-remote tests cover publishing/rejection/retry behavior.

Handoff: [setup, env values, manual tests, and recovery](../docs/content-editor.md).

## Boundaries

Only initial-page conversion; other pages later use separate content documents.
No image uploads, submodule, production publishing, or unrelated refactoring.
Record subsequent integration and verification outcomes here.
