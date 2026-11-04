# Feature implementation plans

These documents describe future features. The `plans` branch contains documentation only and is based on main; no feature branches or feature PRs are created by this change.

## Prerequisites and sequence

Existing content editor work is on the `editor` branches, not main. Merge that work in both repos before features extending the editor; do not merge it into this documentation branch.

1. Main-page-editor adds shared uploads; donation-page-editor independently adds donation editing and preview.
2. Mail-art-gallery follows main-page-editor. Organization-management and financial-transparency follow donation-page-editor.
3. Percentage-allocation is independently reviewable; deploy its compatible backend/migration before its public frontend. Keep its unit contract when combining organization changes.
4. Export-options and the public site's artist-image-size are independent.

Create each feature branch from main after its prerequisites merge, with one PR per affected repository and matching branch names. Link paired PRs, state deployment order, and keep payment/data compatibility in their acceptance criteria. All plans are proposed, not current API contracts.

## Plans

| Feature                                                                   | Future branch                     | PR split              |
| ------------------------------------------------------------------------- | --------------------------------- | --------------------- |
| [Main-page editor: uploads and navigation](main-page-editor.md)           | `feature/main-page-editor`        | Paired public-site PR |
| [Donation-page editing](donation-page-editor.md)                          | `feature/donation-page-editor`    | Paired public-site PR |
| [Monthly mail-art gallery](mail-art-gallery.md)                           | `feature/mail-art-gallery`        | Paired public-site PR |
| [Percentage donation allocation](percentage-allocation.md)                | `feature/percentage-allocation`   | Paired public-site PR |
| [Editable financial transparency section](financial-transparency.md)      | `feature/financial-transparency`  | Paired public-site PR |
| [Organization management with permanent keys](organization-management.md) | `feature/organization-management` | Paired public-site PR |
| [Registration CSV export options](export-options.md)                      | `feature/export-options`          | Admin only            |

[Public-site plan index](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/README.md) includes the independent artist-image-size plan. Default design choices not explicitly selected by the user: 5% drag tokens, 5 MiB raster uploads, newest-first gallery with stacked mobile images, normal existing section sizing for the artist image. No initial artwork, replacement recipient list or donation figures were provided; implementations must not fabricate them.
