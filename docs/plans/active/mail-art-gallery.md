# Monthly mail-art gallery

Status: Proposed; documentation only.

Future branch: `feature/mail-art-gallery` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: Merge the existing editor work into main in both repositories first. It is currently on editor branches and is not included in this documentation branch.

Paired public-site plan: [registration-site](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/mail-art-gallery.md).

## Goal

Allow admins to maintain past mail art as month groups; show it between Mail Drops and About Dream-Rock. Each group has 1–3 images, a title and caption; carousel navigation moves between groups, newest month first.

## Implementation and interfaces

- Depend on main-page-editor uploads. Add optional `mailArt` array to existing site content; default missing data to an empty hidden gallery. Each entry contains unique `month` (YYYY-MM), `title`, `caption`, and `images` of `{ src, alt }`. Month is the sorting identity; enforce real valid months and at most one group per month.
- Add stable internal IDs to ordinary sections with backward-compatible defaults, preserve them in editor round trips, and use them to anchor the gallery between Mail Drops and About Dream-Rock rather than matching editable titles.
- Provide add/edit/remove group controls, 1–3 uploaded or existing images, alt text, and explicit month input. Sort by month rather than relying on manual array order; preserve image order inside a group.
- Reuse drafts/review/publish and extend validation of all referenced gallery assets. A partially edited group may remain in a local draft, but published groups require month, title, caption and 1–3 valid images with alt text.
- Paired public PR renders accessible previous/next group controls without autoplay, hides controls for a single group and stacks images on narrow screens. Admin preview uses that same renderer.
- Deploy optional public schema support first, then gallery admin writes. No backfill or initial artwork is included.

## Acceptance and tests

Cover empty/one/many groups, month/year ordering, duplicate or invalid months, zero/four images, missing assets, upload failure and reload of drafts. Verify title/caption escaping, keyboard navigation, mobile layout, group position and atomic asset publication. Run focused content/editor/preview/publishing tests, typecheck and build.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
