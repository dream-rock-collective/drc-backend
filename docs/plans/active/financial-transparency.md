# Editable financial transparency section

Status: Proposed; documentation only.

Future branch: `feature/financial-transparency` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: Merge the existing editor work into main in both repositories first. It is currently on editor branches and is not included in this documentation branch.

Paired public-site plan: [registration-site](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/financial-transparency.md).

## Goal

Add a title and rich-text body directly to the subscribed/donation screen. Admins manually enter monthly donation totals and explanation; no calculated accounting report or new public page.

## Implementation and interfaces

- Depend on donation-page-editor. Extend donation content with optional `transparency: { title, body }`; absent or empty content hides the section; reject a nonempty body without a title. Use existing safe rich text grammar and size limits.
- Add a named Financial transparency panel to the donation editor. Preview, draft recovery, change review and Git publish include these fields.
- Public paired PR shows the section beneath the donation allocation area on the subscribed screen. This is published site content, not confidential subscriber data; no new authentication boundary is implied.
- Deploy additive public content support before admin writes. Start with no invented financial figures; empty content stays hidden until supplied by an administrator.

## Acceptance and tests

Test missing/empty content, supplied title/body, invalid links/HTML, round-trip edits, preview/public parity and preserved donation interaction. Check desktop/mobile layout. Run focused content/editor/preview tests, typecheck and build.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
