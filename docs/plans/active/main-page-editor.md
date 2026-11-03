# Main-page editor: uploads and navigation

Status: Proposed; documentation only.

Future branch: `feature/main-page-editor` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: Merge the existing editor work into main in both repositories first. It is currently on editor branches and is not included in this documentation branch.

Paired public-site plan: [registration-site](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/main-page-editor.md).

## Goal

Make the existing main-screen editor easy to find and allow image uploads for sections. Existing text, rich text, section ordering and image selection remain the editing model; no layout designer.

## Implementation and interfaces

- Label the page selector “Main page”. Reuse ContentEditor, drafts, preview, review and Git publishing from the editor prerequisite.
- Add authenticated, same-admin-origin multipart POST `/api/site-content/images` accepting one `file`; return `{ src }` with an immutable root-relative asset path. Limit to 5 MiB PNG/JPEG/WebP, verify signature and decoded image validity, reject SVG and mismatched types, generate filenames on the server, and prevent traversal/symlink writes.
- Stage new assets separately from tracked checkout changes. Include staged assets in previews and publish referenced new assets with content in the same Git commit under the existing publication lock/revision check. An upload alone must not publish the site. Retain staged assets for recoverable drafts; omit automated asset deletion in v1.
- Publish only validated referenced assets; never overwrite an existing asset. Refresh the picker after successful upload and keep previous selection after errors.
- Extend site-content/publishing/preview asset validation and fixtures. Registration-site owns content validation and rendering; coordinate its paired PR. Gallery reuses this upload path.

## Acceptance and tests

Test authentication/origin failures, limit/type/signature/path rejection, valid upload/selection, abandoned upload staying unpublished, revision conflict, missing staged image, preview access and atomic content-plus-image publish. Verify local/remote publishing modes and desktop/mobile editor flow. Run focused content/publishing/preview tests, typecheck and admin build.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
