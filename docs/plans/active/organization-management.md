# Organization management with permanent keys

Status: Proposed; documentation only.

Future branch: `feature/organization-management` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: Merge the existing editor work into main in both repositories first. It is currently on editor branches and is not included in this documentation branch.

Paired public-site plan: [registration-site](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/organization-management.md).

## Goal

Manage donation recipients from the admin donation editor. New organizations receive fresh permanent keys; retiring or replacing a recipient must never rewrite past allocation entries.

## Implementation and interfaces

- Depend on donation-page-editor. Store optional `donation.organizations` entries with immutable `id`, display `name`, safe `url`, rich-text `description`, and `active` flag. Seed the existing three organizations using their exact current IDs when the field is absent.
- Generate a new UUID once when adding an organization, retain it through draft reload/publish, and hide it from editable text fields. Replacing a recipient means retiring the old entry and adding another; never recycle IDs or remove retired records through the UI.
- Validate unique IDs, safe URLs and at least one active organization. On publish, compare with the current revision and reject deletion/identity mutation of existing entries; new entries cannot reuse retired IDs. Keep existing conflict protection.
- Public PR renders active organizations in stored order and invalidates browser drafts involving retired IDs. Do not rewrite historical database JSON or remap allocations to replacements. Admin history always retains raw IDs as a fallback for unknown recipients.
- Deploy public schema/default handling first, then admin writes. Existing allocation API remains generic about recipient keys; adding server recipient enforcement is outside this feature.

## Acceptance and tests

Test seeding exact legacy IDs, generated IDs stable through drafts, duplicate/reused keys, retirement, replacement, stale publish conflicts, zero-active rejection, unsafe content and unchanged historical allocations. Verify dynamic public rendering with more/fewer recipients and stale saved allocations. Run focused content/publishing/allocation tests, typecheck and build.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
