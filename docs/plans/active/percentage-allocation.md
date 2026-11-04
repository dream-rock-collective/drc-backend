# Percentage donation allocation

Status: Proposed; documentation only.

Future branch: `feature/percentage-allocation` from main after prerequisites merge. Open one feature PR in this repository; link the paired PR when applicable.

Prerequisite: Merge the existing editor work into main in both repositories first. It is currently on editor branches and is not included in this documentation branch.

Paired public-site plan: [registration-site](https://github.com/dream-rock-collective/registration-site/blob/plans/docs/plans/active/percentage-allocation.md).

## Goal

Allocate 100% of the existing donation share among recipients; do not alter payment prices or the donated share. Retain drag/drop plus accessible click controls. Default: twenty tokens worth 5% each, with remaining percentage and submission only at 100%.

## Implementation and compatibility

- Add `allocationUnit: "dollars" | "percent"` to submission and history/admin representations. Omitted units from old clients mean dollars. Add an allocation-unit column defaulting to dollars so historical JSON values remain unchanged; never infer units from totals.
- Extend all allocation insert/query callers, latest-allocation registration queries, admin types/display and edit form to carry units. Preserve units on edits and display `$` or `%` accordingly; never silently convert historical amounts.
- Percent submissions require nonnegative integer multiples of 5 totaling exactly 100. Keep server-side completed-payment/registration validation and existing legacy-dollar behavior. No organization allowlist change belongs in this feature.
- Public PR updates drag/drop amounts, token labels, reset/randomize and local saved allocations. Missing local unit means historical dollars: preserve that record, but start a fresh percent draft instead of relabeling it. Only restore a percent draft whose total and active recipient IDs remain valid.
- Deploy backend migration/API compatibility first, then percentage frontend; legacy clients remain supported. Reverting frontend must not remove the column or reinterpret percent records.

## Acceptance and tests

Test old payloads and rows as dollars, explicit percent round trips, negative/fractional/non-5/under/over totals rejected, unpaid submission rejected, history and latest/admin displays in mixed units, edits preserving units, and old browser state. Public tests cover drag/drop, click/touch, reset/randomize, exact 100% gating and failure/retry. Run focused allocation/registration tests, typecheck and build; update paired API documentation.

## Completion

Update authoritative API/content documentation for changed behavior. Attach focused test results and desktop/mobile evidence where UI changes. Merge only this feature; no unrelated cleanup.
