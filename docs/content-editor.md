# Website editor handoff

The editor changes the initial registration page only. Text is stored in the
registration-site checkout at `content/initial-page.json`. Images are selected
from that checkout's existing `public/` assets. Uploads and other pages are not
part of this release.

Editable groups are Join Pane, Member Pane, Messages, Page Sections, and Footer.
The footer text includes its emoji; edit or remove it directly in that field.
Website metadata, logo labels/alt text, and membership plan labels stay fixed in
the registration-site code. Existing browser drafts retain their editable text
while obsolete groups are removed; stale revisions still require review.

## Local setup

Keep the existing database, authentication, and Stripe settings in the backend
`.env`. Add these publishing settings:

```dotenv
SITE_PUBLISH_MODE=local
SITE_CHECKOUT_PATH=../registration-site
BETTER_AUTH_URL=http://localhost:6942
REGISTRATION_SITE_ORIGIN=http://localhost:5173
```

Paths resolve from the backend working directory when running Bun directly.
Local Publish writes the JSON file without committing or pushing. Use a copy of
the site checkout if you do not want test edits in your working tree.

Install locked dependencies in both repositories. In `drc-backend`, run
`bun run build` and `bun run start`, then open
`http://localhost:6942/editor` and sign in with your existing admin account.
Serve the registration site separately with `bun run dev` from its directory.
Use the exact host configured in `BETTER_AUTH_URL` when opening the admin;
`localhost` and `127.0.0.1` are different origins.

## Remote publishing

Use a dedicated, clean registration-site clone on the configured branch. That
branch must already contain the JSON conversion and preview support. Do not use
your normal development checkout as the production publisher checkout.

```dotenv
SITE_PUBLISH_MODE=remote
SITE_CHECKOUT_PATH=/absolute/path/to/registration-site-publisher
SITE_REPOSITORY=git@github.com:dream-rock-collective/registration-site.git
SITE_PUBLISH_BRANCH=main
SITE_GIT_NAME=Dream Rock Editor
SITE_GIT_EMAIL=YOUR_COMMIT_EMAIL
SITE_DEPLOY_KEY_PATH=/absolute/path/to/registration-site-deploy-key
SITE_KNOWN_HOSTS_PATH=/absolute/path/to/known_hosts
BETTER_AUTH_URL=https://YOUR_ADMIN_HOST
REGISTRATION_SITE_ORIGIN=https://dreamrock.co
```

Create an SSH key specifically for this site repository and register its public
key as a GitHub deploy key with write access. Keep the private key out of both
repositories. Populate the known-hosts file with the Git host's independently
verified public host keys. The publisher requires strict host verification.
The checkout's fetch and push origins must each have exactly one URL matching
`SITE_REPOSITORY`, and its current branch must match `SITE_PUBLISH_BRANCH`.

Remote Publish commits only the content JSON and pushes the configured branch.
A push to `main` triggers the existing GitHub Pages workflow. A successful push
does not mean that deployment has finished; check GitHub Actions separately.
For a non-production trial, provision an existing test branch and matching
dedicated checkout, then configure that branch instead of `main`.

For Docker, the host checkout is mounted at `/site`. Start with
`docker compose -f docker-compose.yml -f compose.site-ssh.yml up -d --build`
for SSH publishing; local mode does not need the SSH overlay. Environment key
paths are host paths for the overlay mounts. Its container paths are configured
by the overlay. Run one publishing service per checkout.

## Live preview

Install the registration site's locked dependencies in the configured checkout
before opening the editor. The backend builds its preview on first use and
serves the result itself; a separate running Vite server is not required for the
embedded preview. In Docker, install those dependencies in the container's
mounted checkout:

```sh
docker compose exec backend sh -c 'cd /site && bun install --frozen-lockfile'
```

The editor updates the preview as you type without rebuilding for each edit.
Use Desktop/Mobile to inspect widths, and reload the editor after site code or
assets change. Retry preview is available when loading fails. Preview errors preserve the last valid rendered page. Registration,
payment, and navigation actions are disabled in the iframe.
No additional preview environment variables are required. `BETTER_AUTH_URL`
must match the admin browser origin for sign-in, publishing, and preview.

## Manual acceptance checklist

1. Open Registrations, choose Website editor, and confirm the displayed mode.
2. Edit a join label and section body. Try bold, italic, links, and lists. Reload
   and confirm the browser restores the unpublished draft.
3. Add a section, move it, choose an existing image, and edit its alt text.
   Remove a section and check its confirmation. Check the live preview at both
   widths before publishing; verify that preview form controls cannot submit.
4. Choose Publish and review the Before/After values in the modal. Keep editing
   cancels without writing; Confirm publish applies the changes. In local mode,
   inspect the JSON diff and the running site. Confirm
   form request keys remain `name`, `email`, `address`, and `birthday`.
5. Change the JSON outside the editor, then try publishing the old draft.
   Publication must stop and preserve the draft for review against newer copy.
6. Discard a draft and confirm the current published content returns. Sign out
   and confirm content APIs are unavailable without a session.
7. For remote acceptance, use a disposable branch/remote. Verify the commit
   changes only the JSON, then test a rejected push and Retry push. Never use
   production publishing as a smoke test.

Drafts live in this browser, scoped to the administrator and site checkout.
They are not shared between devices. Clearing browser storage removes unpublished drafts.

## Automated checks

Backend: `bun test`, `bun run lint`, and `bun run build`.
Registration site: `bun test`, `bun run lint`, and `bun run build`.
The backend tests use temporary local repositories and bare remotes, without
contacting GitHub. See `plans/content-editor.md` in each repository for recorded
verification and remaining acceptance work.

Verified for this change: 41 backend tests and 13 site tests; lint, type checks,
normal/preview builds; Docker image build and Git/SSH availability; real local
sign-in, draft editing, local publication, and embedded live preview. Compact
desktop/mobile browser checks passed. Production SSH access, branch permissions,
and GitHub Pages deployment must be checked with your configured deployment;
they were not exercised against the live repository.

`compose.editor-test.yml` provides an isolated temporary database for real auth
checks; the backend README documents its migration and seeding commands. Do not
run smoke tests or migrations against an unidentified database.

## Recovery

A rejected push keeps the generated commit for retry. Retry the same content
before making further changes. Changed or diverged Git state requires operator
review; the publisher never force-pushes or resets your changes. An interrupted
process may leave `.git/site-publisher.lock` (remote) or a temporary publisher
lock (local). Remove a lock only after confirming no publisher process is
running. A crash between creating a commit and saving retry metadata requires
operator reconciliation of the commit and remote before publishing resumes.
