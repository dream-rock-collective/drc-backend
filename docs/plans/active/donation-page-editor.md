# Donation-page editing

Status: Proposed; documentation only.

Future branch: `feature/donation-page-editor` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: Merge the existing editor work into main in both repositories first. It is currently on editor branches and is not included in this documentation branch.

Paired public-site plan: [registration-site](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/donation-page-editor.md).

## Goal

Expose the donation/allocation page in the admin page selector alongside Main page. Edit copy and images within its current layout; keep recipient lifecycle in organization-management.

## Implementation and interfaces

- Extend the existing site-content document with optional `donation` content, using defaults matching current public copy when absent. Registration-site owns its validated type, defaults and pure renderer; keep the existing initial-page contract backward compatible.
- Add labeled controls for donation page headings, explanatory copy, action labels and existing informational images/links. Reuse rich-text validation, asset selection, draft persistence, publication review and conflict handling.
- Keep checkout prices, donation budgets and payment authorization outside editor content. Organization IDs cannot be changed through generic text controls.
- Extend preview requests with a validated page selector (`main` or `donation`), defaulting to main for existing clients. Render donation preview without payment scripts, writes or submissions. Include donation fields in change review and preserve unknown-to-old-page fields when switching pages.
- Share deployment contract with the paired registration-site PR: deploy additive public schema/default support before enabling new admin writes. Existing content must still load and publish.

## Acceptance and tests

Test old content/defaults, donation edits through save/reload/preview/publish, switching pages without lost edits, invalid rich text/assets, revision conflicts and harmless preview buttons. Extend existing content/editor-state/preview/publishing fixtures; run focused tests, typecheck and admin build.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
